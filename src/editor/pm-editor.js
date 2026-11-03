// ==================== DOKUMENT-EDITOR AUF TIPTAP (Phase 9.4) ====================
//
// Die Fläche, ohne Leiste und Dialoge: Der Gastgeber (in LearningModules
// docspec-tiptap.js) bekommt die Änderungen als Spec und ruft Befehle auf. Gespeichert
// wird weiter die Spec (pm-convert.js), bis Phase 9.5 das Format umstellt.

import {
  Editor, Extension, Fragment, NodeSelection, Plugin, PluginKey, PmNode, Slice, TextSelection, InputRule,
  history, undo, redo, gapCursor, dropCursor, tableEditing, goToNextCell, isInTable,
  addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell,
} from '../vendor/tiptap/tiptap.mjs';
import { KARO_MAX_WIDTH_CM, INLINE_MATH_SOURCE, latexToMathml } from '../doc/docspec.js';
import { widgetHtml } from '../doc/docspec-html.js';
import { isInlinePaste, pasteToSpec } from '../doc/paste.js';
import { pmExtensions } from '../doc/pm-tiptap.js';
import { pmToSpec, specToPm, textToInline } from '../doc/pm-convert.js';
import { pmToMarkdown } from '../doc/pm-markdown.js';
import { missingIds } from './pm-ids.js';

const ATOMS = ['image', 'group', 'formula', 'karo', 'spacer', 'pagebreak', 'quiz', 'rawBlock'];
const BAR = [['up', '↑', 'Nach oben'], ['down', '↓', 'Nach unten'], ['dup', '⧉', 'Verdoppeln'], ['edit', '✏️', 'Bearbeiten'], ['del', '✕', 'Entfernen']];
const blockOfNode = (node) => pmToSpec({ type: 'doc', content: [node.toJSON()] }).content[0];

const BlockIds = Extension.create({
  name: 'blockIds',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('blockIds'),
      appendTransaction(trs, _old, state) {
        if (!trs.some((t) => t.docChanged)) return null;
        const changes = missingIds(state.doc);
        if (!changes.length) return null;
        const { tr } = state;
        for (const c of changes) tr.setNodeAttribute(c.pos, 'id', c.id);
        return tr.setMeta('addToHistory', false);
      },
    })];
  },
});

/** Felder einer Tiptap-Erweiterung: Tastenkürzel und was ProseMirror mitbringt. */
const Basics = Extension.create({
  name: 'basics',
  addProseMirrorPlugins() {
    return [history(), gapCursor(), dropCursor({ color: 'var(--accent, #2563eb)' }), tableEditing()];
  },
  addKeyboardShortcuts() {
    const mark = (name) => () => this.editor.commands.toggleMark(name);
    return {
      'Mod-z': () => undo(this.editor.state, this.editor.view.dispatch),
      'Mod-y': () => redo(this.editor.state, this.editor.view.dispatch),
      'Shift-Mod-z': () => redo(this.editor.state, this.editor.view.dispatch),
      'Mod-b': mark('bold'),
      'Mod-i': mark('italic'),
      'Mod-u': mark('underline'),
      'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hardBreak' }),
      Enter: () => this.editor.commands.splitListItem('listItem'),
      Tab: () => goToNextCell(1)(this.editor.state, this.editor.view.dispatch) || this.editor.commands.sinkListItem('listItem'),
      'Shift-Tab': () => goToNextCell(-1)(this.editor.state, this.editor.view.dispatch) || this.editor.commands.liftListItem('listItem'),
      'Alt-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-ArrowDown': () => moveBlock(this.editor, 1),
    };
  },
});

/** Der Baustein an der Auswahl: gewählter Baustein, sonst der Block der Schreibmarke (auf der Ebene seines Behälters). */
function currentBlock(state) {
  const { selection, doc } = state;
  if (selection instanceof NodeSelection && selection.node.isBlock) return { pos: selection.from, node: selection.node };
  const $p = selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    const parent = $p.node(d - 1).type.name;
    if (['doc', 'box', 'solution', 'column'].includes(parent)) return { pos: $p.before(d), node: $p.node(d) };
  }
  return doc.childCount ? { pos: 0, node: doc.child(0) } : null;
}

/** Baustein an der Auswahl um eins nach oben oder unten, innerhalb seines Behälters. */
function moveBlock(editor, dir) {
  const { state, view } = editor;
  const cur = currentBlock(state);
  if (!cur) return false;
  const $pos = state.doc.resolve(cur.pos);
  const parent = $pos.parent;
  const index = $pos.index();
  const other = index + dir;
  if (other < 0 || other >= parent.childCount) return false;
  const tr = state.tr.delete(cur.pos, cur.pos + cur.node.nodeSize);
  const target = dir < 0 ? cur.pos - parent.child(other).nodeSize : cur.pos + parent.child(other).nodeSize;
  tr.insert(target, cur.node);
  tr.setSelection(cur.node.isAtom ? NodeSelection.create(tr.doc, target) : TextSelection.near(tr.doc.resolve(target + 1)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Baustein am Stück: sieht aus wie in der Vorschau; wählen, ziehen, per Doppelklick bearbeiten. */
function atomView(host) {
  return ({ node, getPos, editor }) => {
    let current = node;
    const dom = document.createElement('div');
    const paint = () => {
      const t = document.createElement('div');
      t.innerHTML = widgetHtml(blockOfNode(current));
      const w = t.firstElementChild;
      dom.className = w.className;
      dom.title = w.title;
      dom.contentEditable = 'false';
      dom.dataset.pmAtom = current.type.name;
      dom.replaceChildren(...w.childNodes);
    };
    paint();
    const select = () => editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, getPos())));
    const act = (what) => {
      select();
      if (what === 'edit') host.editBlock?.(blockOfNode(current), applyAt(editor, getPos));
      else if (what === 'del') editor.commands.deleteSelection();
      else if (what === 'dup') duplicate(editor);
      else moveBlock(editor, what === 'up' ? -1 : 1);
    };
    dom.addEventListener('dblclick', (e) => { e.preventDefault(); act('edit'); });
    let bar = null;
    return {
      dom,
      update(next) {
        if (next.type !== current.type) return false;
        current = next;
        paint();
        if (bar) { dom.appendChild(bar); addGrips(dom, current, editor, getPos, host); }
        return true;
      },
      selectNode() {
        dom.classList.add('ds-widget-selected');
        bar = document.createElement('div');
        bar.className = 'ds-wbar';
        bar.contentEditable = 'false';
        for (const [what, label, title] of BAR) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.title = title;
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', (e) => { e.stopPropagation(); act(what); });
          bar.appendChild(b);
        }
        dom.appendChild(bar);
        addGrips(dom, current, editor, getPos, host);
      },
      deselectNode() {
        dom.classList.remove('ds-widget-selected');
        bar?.remove();
        bar = null;
        dom.querySelectorAll('.ds-karo-grip').forEach((g) => g.remove());
      },
      stopEvent: (e) => !!e.target.closest?.('.ds-wbar, .ds-karo-grip'),
      ignoreMutation: () => true,
    };
  };
}

/** Schreibfeld ziehen: rechter Rand = Breite, unterer Rand = Höhe, im 0,5-cm-Raster. */
function addGrips(dom, node, editor, getPos, host) {
  const karo = dom.querySelector('.ds-karo');
  if (node.type.name !== 'karo' || !karo || dom.querySelector('.ds-karo-grip')) return;
  for (const [dir, title] of [['e', 'Breite ziehen'], ['s', 'Höhe ziehen'], ['se', 'Breite und Höhe ziehen']]) {
    const grip = document.createElement('span');
    grip.className = `ds-karo-grip ds-karo-grip-${dir}`;
    grip.title = title;
    karo.appendChild(grip);
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const lines = Number.isInteger(node.attrs.lines) ? node.attrs.lines : 4;
      const box = karo.getBoundingClientRect();
      const pxPerCm = box.height / (lines * 0.5);
      const step = (px) => Math.round((px / pxPerCm) * 2) / 2;
      let width = node.attrs.width ? step(box.width) : null;
      let height = lines * 0.5;
      const size = Object.assign(document.createElement('span'), { className: 'ds-karo-size' });
      const show = () => { size.textContent = `${width ? `${String(width).replace('.', ',')} cm` : 'ganze Breite'} × ${String(height).replace('.', ',')} cm`; };
      karo.appendChild(size);
      show();
      grip.setPointerCapture(e.pointerId);
      const move = (ev) => {
        if (dir.includes('e')) {
          width = Math.max(1, Math.min(KARO_MAX_WIDTH_CM, step(box.width + ev.clientX - e.clientX)));
          karo.style.width = `${width}cm`;
          karo.style.maxWidth = '100%';
        }
        if (dir.includes('s')) {
          height = Math.max(0.5, Math.min(30, step(box.height + ev.clientY - e.clientY)));
          karo.style.height = `${height}cm`;
        }
        show();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        size.remove();
        // Bis zum rechten Rand gezogen heißt „ganze Breite“: Das Feld folgt der Vorlage.
        const full = host.fullWidthCm?.() ?? 16.5;
        const attrs = { ...node.attrs, lines: Math.max(1, Math.min(60, Math.round(height * 2))), width: width && width < full ? `${width}cm` : null };
        const pos = getPos();
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, attrs));
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }
}

/** Formel im Text: gesetzt; Doppelklick macht wieder Text daraus. */
function mathView({ node, getPos, editor }) {
  const dom = document.createElement('span');
  dom.className = 'ds-math';
  dom.contentEditable = 'false';
  const paint = (latex) => {
    try { dom.innerHTML = latexToMathml(latex, false); dom.classList.remove('ds-missing'); }
    catch (_) { dom.textContent = `$${latex}$`; dom.classList.add('ds-missing'); }
  };
  paint(node.attrs.latex);
  dom.addEventListener('dblclick', () => {
    const pos = getPos();
    const { latex } = editor.state.doc.nodeAt(pos).attrs;
    const tr = editor.state.tr.replaceWith(pos, pos + 1, editor.schema.text(`$${latex}`));
    tr.setSelection(TextSelection.create(tr.doc, pos + latex.length + 1));
    editor.view.dispatch(tr);
    editor.view.focus();
  });
  return { dom, update: (next) => (next.type === node.type ? (paint(next.attrs.latex), true) : false), ignoreMutation: () => true };
}

/** Baustein an `getPos()` durch die neue Fassung (auch mehrere) ersetzen. */
function applyAt(editor, getPos) {
  return (next) => {
    const pos = getPos();
    const old = editor.state.doc.nodeAt(pos);
    const blocks = next === null ? [] : [].concat(next);
    const nodes = specToPm({ content: blocks }).content?.map((j) => PmNode.fromJSON(editor.schema, j)) || [];
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + old.nodeSize, nodes));
    editor.view.focus();
  };
}

function duplicate(editor) {
  const cur = currentBlock(editor.state);
  if (!cur) return;
  const at = cur.pos + cur.node.nodeSize;
  const tr = editor.state.tr.insert(at, cur.node); // doppelte ID: BlockIds vergibt eine neue
  if (cur.node.isAtom) tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr);
}

const MATH_END = new RegExp(`(?<![\\\\$])${INLINE_MATH_SOURCE}$`);

/**
 * Editor in `element` öffnen. `host`: { onChange(spec), editBlock(block, apply),
 * fullWidthCm(), onWarnings(list), onSelection() }.
 */
export function createPmEditor(element, spec, host = {}) {
  const nodeViews = Object.fromEntries(ATOMS.map((t) => [t, atomView(host)]));
  nodeViews.inlineMath = mathView;
  const toDoc = (s) => {
    const json = specToPm(s);
    return json.content?.length ? json : { ...json, content: [{ type: 'paragraph' }] };
  };
  const editor = new Editor({
    element,
    content: toDoc(spec),
    extensions: [
      ...pmExtensions({
        nodeViews,
        inputRules: {
          // Beim schließenden $: Das Getippte wird die Formel, die Schreibmarke steht dahinter.
          inlineMath: (type) => [new InputRule({
            find: MATH_END,
            handler: ({ state, range, match }) => { state.tr.replaceWith(range.from, range.to, type.create({ latex: match.groups.math })); },
          })],
        },
        inlineAtomText: { inlineMath: ({ node }) => `$${node.attrs.latex}$` },
      }),
      BlockIds,
      Basics,
    ],
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': 'Inhalt bearbeiten' },
      handlePaste: (view, event) => {
        const { clipboardData: data } = event;
        const html = data?.getData('text/html') || '';
        const text = data?.getData('text/plain') || '';
        // Aus diesem Editor: Felder stehen im HTML, ProseMirror fügt selbst ein.
        if (html.includes('data-pm=')) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false;
        const pasted = pasteToSpec({ text, html });
        if (!pasted) return false;
        if (pasted.warnings?.length) host.onWarnings?.(pasted.warnings);
        const schema = view.state.schema;
        if (isInlinePaste(pasted.spec)) {
          const nodes = textToInline(pasted.spec.content[0].text).map((j) => PmNode.fromJSON(schema, j));
          view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView());
          return true;
        }
        const nodes = specToPm(pasted.spec).content.map((j) => PmNode.fromJSON(schema, j));
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView());
        return true;
      },
      // Reiner Text in der Zwischenablage ist Markdown – Karos und Lösungen gehen auch anderswo nicht verloren.
      clipboardTextSerializer: (slice) => {
        const content = slice.content.toJSON() || [];
        if (content.every((n) => n.type !== 'text' && n.type !== 'listItem' && n.type !== 'tableRow' && n.type !== 'hardBreak' && n.type !== 'inlineMath')) {
          return pmToMarkdown({ type: 'doc', content }, { ids: false });
        }
        return slice.content.textBetween(0, slice.content.size, '\n', (leaf) => (leaf.type.name === 'inlineMath' ? `$${leaf.attrs.latex}$` : leaf.type.name === 'hardBreak' ? '\n' : ''));
      },
    },
    onUpdate: ({ editor: e }) => host.onChange?.(pmToSpec(e.getJSON())),
    onSelectionUpdate: () => host.onSelection?.(),
  });

  const run = (command) => { const ok = command(editor.state, editor.view.dispatch); editor.view.focus(); return ok; };
  /** Für jeden Textblock der Auswahl: Art wechseln; die ID bleibt. */
  const setBlockKind = (kind) => {
    const { state, view } = editor;
    const { schema } = state;
    const target = kind === 'p' ? schema.nodes.paragraph : kind === 'note' ? schema.nodes.note : schema.nodes.heading;
    const attrs = kind === 'p' || kind === 'note' ? {}
      : kind.startsWith('heading') ? { role: 'plain', level: Number(kind.slice(7)) || 1 } : { role: kind };
    const tr = state.tr;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
      if (!node.isTextblock || node.type.spec.code) return true;
      if (!parent.canReplaceWith(index, index + 1, target)) return false;
      tr.setNodeMarkup(pos, target, { ...attrs, id: node.attrs.id ?? null });
      return false;
    });
    if (tr.docChanged) view.dispatch(tr);
    view.focus();
  };

  return {
    editor,
    getSpec: () => pmToSpec(editor.getJSON()),
    /** Stand von außen (YAML, Markdown, Stift-Editor): gilt nicht als Änderung und nicht als Rückgängig-Schritt. */
    setSpec(next) {
      editor.commands.setContent(toDoc(next), { emitUpdate: false });
    },
    destroy: () => editor.destroy(),
    focus: () => editor.view.focus(),
    /** Absatzart an der Auswahl: p, note, section, task, subtask, heading1–3, ul, ol. */
    blockKind() {
      const { $from } = editor.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        const name = $from.node(d).type.name;
        if (name === 'bulletList') return 'ul';
        if (name === 'orderedList') return 'ol';
      }
      const n = $from.parent;
      if (n.type.name === 'note') return 'note';
      if (n.type.name !== 'heading') return 'p';
      const { role, level } = n.attrs;
      return role === 'plain' ? `heading${level > 1 ? level : ''}` : role;
    },
    setBlockKind(kind) {
      if (kind === 'ul' || kind === 'ol') {
        editor.chain().focus().toggleList(kind === 'ul' ? 'bulletList' : 'orderedList', 'listItem').run();
        return;
      }
      if (this.blockKind() === 'ul' || this.blockKind() === 'ol') editor.chain().focus().liftListItem('listItem').run();
      setBlockKind(kind);
    },
    isActive: (name, attrs) => editor.isActive(name, attrs),
    toggleMark: (name) => editor.chain().focus().toggleMark(name).run(),
    setSize(pt) {
      const cur = editor.getAttributes('textStyle');
      const attrs = { color: cur.color ?? null, fontSize: pt || null };
      const chain = editor.chain().focus();
      (attrs.color || attrs.fontSize ? chain.setMark('textStyle', attrs) : chain.unsetMark('textStyle')).run();
    },
    setColor(color) {
      const cur = editor.getAttributes('textStyle');
      const attrs = { color: color || null, fontSize: cur.fontSize ?? null };
      const chain = editor.chain().focus();
      (attrs.color || attrs.fontSize ? chain.setMark('textStyle', attrs) : chain.unsetMark('textStyle')).run();
    },
    setHighlight(color) {
      const chain = editor.chain().focus();
      (color ? chain.setMark('highlight', { color }) : chain.unsetMark('highlight')).run();
    },
    setLink(href) {
      const chain = editor.chain().focus().extendMarkRange('link');
      (href ? chain.setMark('link', { href }) : chain.unsetMark('link')).run();
    },
    linkHref: () => editor.getAttributes('link').href || '',
    clearMarks: () => editor.chain().focus().unsetAllMarks().run(),
    /** Felder des Absatzes bzw. der Liste an der Auswahl (align, indent …). */
    paragraphAttrs() {
      const { $from } = editor.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d);
        if (n.type.name === 'bulletList' || n.type.name === 'orderedList') return { pos: $from.before(d), node: n };
      }
      return $from.parent.type.name === 'paragraph' ? { pos: $from.before(), node: $from.parent } : null;
    },
    updateAttrsAt(pos, attrs) {
      const { state, view } = editor;
      view.dispatch(state.tr.setNodeMarkup(pos, null, { ...state.doc.nodeAt(pos).attrs, ...attrs }));
      view.focus();
    },
    /** Innerster Knoten dieser Arten um die Auswahl: { pos, node } oder null. */
    enclosing(...names) {
      const { $from } = editor.state.selection;
      for (let d = $from.depth; d > 0; d--) if (names.includes($from.node(d).type.name)) return { pos: $from.before(d), node: $from.node(d) };
      return null;
    },
    /** Bausteine hinter dem Block an der Auswahl einfügen; der erste wird gewählt. */
    insertBlocks(blocks) {
      const { state, view } = editor;
      const cur = currentBlock(state);
      const at = cur ? cur.pos + cur.node.nodeSize : 0;
      const nodes = specToPm({ content: blocks }).content.map((j) => PmNode.fromJSON(state.schema, j));
      const tr = state.tr.insert(at, nodes);
      const first = nodes[0];
      tr.setSelection(first.isAtom ? NodeSelection.create(tr.doc, at) : TextSelection.near(tr.doc.resolve(at + 1)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return at;
    },
    /** Gerade gewählter Baustein am Stück mit seiner Ersetzungsfunktion. */
    selectedBlock() {
      const { selection } = editor.state;
      if (!(selection instanceof NodeSelection)) return null;
      const pos = selection.from;
      return { block: blockOfNode(selection.node), apply: applyAt(editor, () => pos) };
    },
    move: (dir) => moveBlock(editor, dir),
    duplicate: () => duplicate(editor),
    inTable: () => isInTable(editor.state),
    table: {
      addRowBefore: () => run(addRowBefore),
      addRowAfter: () => run(addRowAfter),
      addColumnBefore: () => run(addColumnBefore),
      addColumnAfter: () => run(addColumnAfter),
      deleteRow: () => run(deleteRow),
      deleteColumn: () => run(deleteColumn),
      deleteTable: () => run(deleteTable),
      mergeCells: () => run(mergeCells),
      splitCell: () => run(splitCell),
    },
    undo: () => run(undo),
    redo: () => run(redo),
  };
}
