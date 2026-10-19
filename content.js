// Applies the active Cursor Closet set to every page and frame.
//
// One stylesheet gives every element the uploaded default cursor right away, so the
// native arrow never flashes through. The first time the mouse enters an element we
// briefly lift our rule from it (and its untagged ancestors), read the cursor the page
// wants, and tag it: hover ("h") for clickable things, text field ("t"), native ("n") for
// cursors that carry meaning (resize, grab, wait…), or default ("d"). This all happens
// inside the event, before the next paint.
(() => {
  // A copy injected earlier (e.g. before the extension was reloaded) cleans up first.
  window.__cursorCloset?.teardown?.();
  document.querySelectorAll('style#cursor-closet').forEach((el) => el.remove());

  const MARK = 'data-cc';
  const PROBE = 'data-cc-probe';
  const ON = 'data-cc-on';
  const DOWN = 'data-cc-down';
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
    const on = `html[${ON}]`;
    const plain = `:not([${PROBE}]):not([${MARK}="h"]):not([${MARK}="t"]):not([${MARK}="n"])`;
    const rules = [
      `${on}${BOOST}, ${on} *${plain}${BOOST} { ${cursorDecl(a.default, 'default')} }`,
      `${on} [${MARK}="h"]:not([${PROBE}])${BOOST} { ${cursorDecl(a.hover || a.default, 'pointer')} }`,
      `${on} [${MARK}="t"]:not([${PROBE}])${BOOST} { cursor: text !important }`,
    ];
    if (a.click) {
      const pressed = `${on}[${DOWN}]${BOOST}, ${on}[${DOWN}] *:not([${PROBE}]):not([${MARK}="t"]):not([${MARK}="n"])${BOOST}`;
      rules.push(`${pressed} { ${cursorDecl(a.click, 'default')} }`);
    }
    return rules.join('\n');
  }

  function isEditable(el) {
    if (el.isContentEditable || el.localName === 'textarea') return true;
    return el.localName === 'input' && TEXT_INPUT.test(el.type);
  }

  // Reads the cursor the page itself would show, with our rule lifted from this element.
  function classify(el) {
    el.setAttribute(PROBE, '');
    const cursor = getComputedStyle(el).cursor;
    el.removeAttribute(PROBE);

    if (cursor === 'pointer') return 'h';
    if (isEditable(el) && (cursor === 'auto' || cursor === 'text' || cursor.includes('url('))) {
      return keepText ? 't' : 'd';
    }
    const fallback = el.closest(CLICKABLE) ? 'h' : 'd';
    if (cursor.includes('url(')) {
      // Inherited from an ancestor we tagged (or the site's own image cursor).
      const owner = el.parentElement?.closest(`[${MARK}]`);
      return owner?.getAttribute(MARK) === 'h' ? 'h' : fallback;
    }
    if (cursor === 'text' || cursor === 'vertical-text') return keepText ? 'n' : 'd';
    if (NATIVE.test(cursor)) return 'n';
    return fallback;
  }

  function onOver(e) {
    const target = e.target;
    if (!active || target?.nodeType !== 1 || target.hasAttribute(MARK)) return;
    // Tag untagged ancestors top-down first, so children see what their parents really are.
    const chain = [];
    for (let el = target; el && el !== root && !el.hasAttribute(MARK); el = el.parentElement) chain.push(el);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].setAttribute(MARK, classify(chain[i]));
  }

  function onDown(e) {
    if (active?.click && e.button === 0) root.setAttribute(DOWN, '');
  }

  function onUp() {
    root.removeAttribute(DOWN);
  }

  function clearTags() {
    for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  }

  function apply(enabled, next) {
    const nextKeepText = next?.keepTextCursor !== false;
    if (nextKeepText !== keepText) {
      // Text-field tags depend on this setting, so start over.
      clearTags();
      keepText = nextKeepText;
    }
    active = enabled && next?.default ? next : null;
    onUp();
    if (!active) {
      root.removeAttribute(ON);
      style.remove();
      return;
    }
    style.textContent = buildCss(active);
    attachStyle();
    root.setAttribute(ON, '');
  }

  function attachStyle() {
    if (active && !style.isConnected) (document.head || root).appendChild(style);
  }

  async function load() {
    // After the extension is reloaded, this copy loses access; step aside for the new one.
    if (!chrome.runtime?.id) return teardown();
    try {
      const { enabled = true, active: next = null } = await chrome.storage.local.get(['enabled', 'active']);
      apply(enabled, next);
    } catch {
      teardown();
    }
  }

  function onStorage(changes, area) {
    if (area === 'local' && ('enabled' in changes || 'active' in changes)) load();
  }

  const opts = { capture: true, passive: true };
  const upEvents = ['pointerup', 'pointercancel', 'dragstart', 'blur'];

  function teardown() {
    removeEventListener('mouseover', onOver, opts);
    removeEventListener('pointerdown', onDown, opts);
    for (const type of upEvents) removeEventListener(type, onUp, opts);
    document.removeEventListener('DOMContentLoaded', attachStyle);
    removeEventListener('load', attachStyle);
    try {
      chrome.storage.onChanged.removeListener(onStorage);
    } catch {
      // Already disconnected.
    }
    style.remove();
    root.removeAttribute(ON);
    root.removeAttribute(DOWN);
    clearTags();
    if (window.__cursorCloset?.teardown === teardown) delete window.__cursorCloset;
  }

  window.__cursorCloset = { teardown };
  addEventListener('mouseover', onOver, opts);
  addEventListener('pointerdown', onDown, opts);
  for (const type of upEvents) addEventListener(type, onUp, opts);
  // Some sites rebuild <head> while loading; put the stylesheet back if it gets dropped.
  document.addEventListener('DOMContentLoaded', attachStyle);
  addEventListener('load', attachStyle);
  chrome.storage.onChanged.addListener(onStorage);
  load();
})();
