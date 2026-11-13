/**
 * Effective CSS zoom on <body> (relaxed density sets `zoom: 1.12`).
 *
 * Portals render inside <body>, so a `position: fixed` popup's left/top are
 * zoomed once more, while getBoundingClientRect() and window.innerWidth are
 * viewport pixels. Divide viewport coordinates by this factor before using
 * them as a portal's left/top. Measured instead of read from CSS so it holds
 * in every engine (Chromium, WebKit) whatever its zoom model.
 */
export function bodyZoom(): number {
  const b = document.body;
  if (!b.offsetWidth) return 1;
  return b.getBoundingClientRect().width / b.offsetWidth || 1;
}
