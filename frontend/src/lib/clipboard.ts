/**
 * Copies text even when the page has lost focus (drawers, overlays): the async
 * Clipboard API silently fails there, so fall back to a hidden textarea.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && document.hasFocus()) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* fall through */ }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.focus(); el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}
