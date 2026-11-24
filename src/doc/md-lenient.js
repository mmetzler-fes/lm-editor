// ==================== MARKDOWN: FETT WIE IN KI-CHATS ====================
//
// CommonMark (markdown-it) schließt `**` nicht, wenn davor ein Satzzeichen und
// direkt danach ein Buchstabe steht: `**Schritt 1:**Text` bliebe mit Sternchen
// stehen. Antworten aus KI-Chats (Gemini, ChatGPT …) sehen beim Kopieren oft so
// aus, und deren Anzeige macht es fett. Hier genauso – nur für `**`, nicht für
// einzelne `*` (sonst würden Malzeichen wie 2*3*4 kursiv).

const WORD = /[\p{L}\p{N}]/u;

/** Die Lockerung an einer markdown-it-Instanz einschalten (wirkt auf alle Instanzen derselben Bibliothek). */
export function lenientStrong(md) {
  const State = md.inline.State;
  if (State.prototype.lmLenientStrong) return;
  const scan = State.prototype.scanDelims;
  State.prototype.scanDelims = function scanDelims(start, canSplitWord) {
    const r = scan.call(this, start, canSplitWord);
    if (r.can_close || r.length < 2 || this.src.charCodeAt(start) !== 0x2A /* * */) return r;
    const prev = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;
    const next = this.src.charAt(start + r.length);
    if ((md.utils.isMdAsciiPunct(prev) || md.utils.isPunctChar(String.fromCharCode(prev))) && WORD.test(next)) {
      r.can_close = true;
    }
    return r;
  };
  State.prototype.lmLenientStrong = true;
}
