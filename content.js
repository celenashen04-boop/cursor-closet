// Applies the active Cursor Closet set to every page and frame.
//
// Pages decide per element whether the cursor is an arrow, a pointing hand, a resize
// handle, etc. When the mouse enters an element we read that native cursor once and tag
// the element as default ("d"), hover ("h") or text field ("t"). A single stylesheet then
// maps those tags to the uploaded images. Meaningful native cursors (resize, grab, wait…)
// are left alone.
(() => {
  if (window.__cursorCloset) return;
  window.__cursorCloset = true;

  const MARK = 'data-cursor-closet';
  const DOWN = 'data-cursor-closet-down';
  // Two :not(#id) clauses add id-level specificity so page rules can't outrank ours.
  const BOOST = ':not(#cc-a):not(#cc-b)';
  const NATIVE = /^(none|context-menu|help|progress|wait|cell|crosshair|alias|copy|move|no-drop|not-allowed|grab|grabbing|all-scroll|zoom-in|zoom-out|[a-z-]*resize)$/;
  const TEXT_INPUT = /^(text|search|email|url|tel|password|number|date|datetime-local|month|week|time)$/;
  // Browsers give these a plain arrow, but they're clickable, so they get the hover design.
  const CLICKABLE = 'button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], summary, select, label[for], input[type="submit"], input[type="button"], input[type="reset"], input[type="checkbox"], input[type="radio"], input[type="file"], input[type="image"], input[type="color"], input[type="range"]';

  const root = document.documentElement;
  const style = document.createElement('style');
  style.id = 'cursor-closet';
  let active = null;
  let keepText = true;

  function cursorDecl(slot, fallback) {
    const pos = `${slot.hx} ${slot.hy}`;
    const set = `url("${slot.x1}") 1x, url("${slot.x2}") 2x`;
    // Later declarations win when supported; unsupported ones are dropped.
    return [
      `cursor: url("${slot.x1}") ${pos}, ${fallback} !important`,
      `cursor: -webkit-image-set(${set}) ${pos}, ${fallback} !important`,
      `cursor: image-set(${set}) ${pos}, ${fallback} !important`,
    ].join(';');
  }

  function buildCss(a) {
    const rules = [
      `[${MARK}="d"]${BOOST} { ${cursorDecl(a.default, 'default')} }`,
      `[${MARK}="h"]${BOOST} { ${cursorDecl(a.hover || a.default, 'pointer')} }`,
      `[${MARK}="t"]${BOOST} { cursor: text !important }`,
    ];
    if (a.click) {
      const pressed = `html[${DOWN}][${MARK}]:not([${MARK}="t"])${BOOST}, html[${DOWN}] [${MARK}]:not([${MARK}="t"])${BOOST}`;
      rules.push(`${pressed} { ${cursorDecl(a.click, 'default')} }`);
    }
    return rules.join('\n');
  }

  function isEditable(el) {
    if (el.isContentEditable || el.localName === 'textarea') return true;
    return el.localName === 'input' && TEXT_INPUT.test(el.type);
  }

  function classify(el) {
    const cursor = getComputedStyle(el).cursor;
    if (cursor === 'pointer') return 'h';
    if (isEditable(el) && (cursor === 'auto' || cursor === 'text' || cursor.includes('url('))) {
      return keepText ? 't' : 'd';
    }
    const fallback = el.closest(CLICKABLE) ? 'h' : 'd';
    if (cursor.includes('url(')) {
      // Usually inherited from an element we already tagged; otherwise the site's own image.
      const owner = el.parentElement?.closest(`[${MARK}]`);
      return owner?.getAttribute(MARK) === 'h' ? 'h' : fallback;
    }
    if (cursor === 'text' || cursor === 'vertical-text') return keepText ? null : 'd';
    if (NATIVE.test(cursor)) return null;
    return fallback;
  }

  function onOver(e) {
    const el = e.target;
    if (!active || el?.nodeType !== 1 || el.hasAttribute(MARK)) return;
    const kind = classify(el);
    if (kind) el.setAttribute(MARK, kind);
  }

  function onDown(e) {
    if (active?.click && e.button === 0) root.setAttribute(DOWN, '');
  }

  function onUp() {
    root.removeAttribute(DOWN);
  }

  function apply(enabled, next) {
    const nextKeepText = next?.keepTextCursor !== false;
    if (nextKeepText !== keepText) {
      // Text-field tags depend on this setting, so start over.
      for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
      keepText = nextKeepText;
    }
    active = enabled && next?.default ? next : null;
    onUp();
    if (!active) {
      style.remove();
      return;
    }
    style.textContent = buildCss(active);
    attachStyle();
    root.setAttribute(MARK, 'd');
  }

  function attachStyle() {
    if (active && !style.isConnected) (document.head || root).appendChild(style);
  }

  async function load() {
    try {
      const { enabled = true, active: next = null } = await chrome.storage.local.get(['enabled', 'active']);
      apply(enabled, next);
    } catch {
      // The extension was reloaded or removed; this page keeps whatever it had.
    }
  }

  addEventListener('mouseover', onOver, { capture: true, passive: true });
  addEventListener('pointerdown', onDown, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel', 'dragstart', 'blur']) {
    addEventListener(type, onUp, { capture: true, passive: true });
  }
  // Some sites rebuild <head> while loading; put the stylesheet back if it gets dropped.
  document.addEventListener('DOMContentLoaded', attachStyle);
  addEventListener('load', attachStyle);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('enabled' in changes || 'active' in changes)) load();
  });
  load();
})();
