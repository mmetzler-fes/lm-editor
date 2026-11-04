/** Stile für Bearbeiten und Dialoge erst bei Bedarf laden: Die Anzeige bleibt davon unberührt. */
export function loadEditorStyles() {
  if (document.querySelector('link[data-text-editor]')) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('../css/text-editor.css', import.meta.url).href });
  link.dataset.textEditor = '1';
  document.head.appendChild(link);
}
