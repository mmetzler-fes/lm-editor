// Gezeichnete Symbole (Strich, Textfarbe) statt Emojis – gleich groß und ruhig auf allen Geräten.
// Gemeinsam für den Editor und die App (LearningModules importiert diese Datei). Stil: 24×24,
// Strichstärke über CSS (.lm-ico in modules.css bzw. styles.css).

export const ICONS = {
  // Inhalte
  document: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 15.5h6',
  attachment: 'M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.2-8.2a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.4-7.4',
  quiz: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17h.01',
  topic: 'M4 5.5C6.5 4 9.5 4 12 5.5v14c-2.5-1.5-5.5-1.5-8 0zM12 5.5c2.5-1.5 5.5-1.5 8 0v14c-2.5-1.5-5.5-1.5-8 0',
  notebook: 'M6 3h12v18H6zM6 7H4M6 12H4M6 17H4M10 7.5h5',
  folder: 'M3 6.5a1.5 1.5 0 011.5-1.5h4l2 2.5h9A1.5 1.5 0 0121 9v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18z',
  exam: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  board: 'M3 4.5h18v12H3zM8 21l4-4.5 4 4.5M7 12.5c1.5-2.5 3-2.5 4-1s2.5 1.5 5-2',
  key: 'M8 14a4 4 0 110-.01M11 12h9M17 12v3M20 12v2.5',
  pen: 'M4 20l1.2-4.4L15.6 5.2a2.1 2.1 0 013 3L8.2 18.6 4 20zM13.8 7l3.2 3.2',
  // Lernformen
  learn: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8V16h7.2v-2.2A6 6 0 0012 3z',
  companion: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  contest: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5v1.5A3 3 0 008 10.5M16 6h3v1.5a3 3 0 01-3 3M12 13v4M8.5 20h7M10 17h4v3h-4z',
  // Zustände
  check: 'M4.5 12.5l5 5 10-11',
  cross: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5h.01',
  retry: 'M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5',
  star: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  thumb: 'M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.5 2.5V10h5a2 2 0 012 2.3l-1.2 6A2 2 0 0117.3 20H7',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h11',
  timer: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  // Bedienung
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  home: 'M3.5 11L12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  list: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  install: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  test: 'M9 3h6M10 3v6l-5 9a2 2 0 001.8 3h10.4a2 2 0 001.8-3l-5-9V3M7.5 14h9',
  follow: 'M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0113 0c0 4.9-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  broadcast: 'M12 12h.01M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 10.5a3 3 0 100 6 3 3 0 000-6z',
  school: 'M3 9l9-5 9 5-9 5zM6 10.7V16c3.5 2.5 8.5 2.5 12 0v-5.3M21 9v6',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  sound: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4 4 0 010 6M19 6.5a7.5 7.5 0 010 11',
  mute: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  stop: 'M6 6h12v12H6z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4.5 20.5a7.5 7.5 0 0115 0',
  party: 'M4 20l4.5-12L16 15.5zM14 4v2M18 6l-1.5 1.5M20 10h-2M11.5 7.5c1-1 1-2.5 0-3.5M16.5 12.5c1-1 2.5-1 3.5 0',
};

/** SVG-Markup eines Symbols; `cls` zusätzlich zu „lm-ico“. Unbekannte Namen → leer. */
export function icon(name, cls = '') {
  const d = ICONS[name];
  return d ? `<svg class="lm-ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>` : '';
}

/** Emoji alter Einträge (z. B. gespeicherte Tabs) → Symbolname. */
export const EMOJI_ICON = {
  '📄': 'document', '📎': 'attachment', '🧩': 'quiz', '📘': 'topic', '📒': 'notebook', '📂': 'folder', '📁': 'folder',
  '📝': 'exam', '✍️': 'pen', '✍': 'pen', '🔑': 'key', '🧠': 'quiz', '💡': 'learn', '🦉': 'companion', '🏆': 'contest',
  '🔗': 'link', '⚠️': 'warn', '✅': 'check', '❌': 'cross', '🔄': 'retry', '⭐': 'star',
};
