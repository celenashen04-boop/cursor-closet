// Shared by the popup and the manager page.

const SLOT_KEYS = ['default', 'hover', 'click'];
const SIZES = [24, 32, 48, 64, 96, 128];
const DEFAULT_STATE = { enabled: true, activeId: null, library: [] };
const SVG_NS = 'http://www.w3.org/2000/svg';

const hasExtStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

// Falls back to localStorage so the pages can be previewed outside the extension.
const store = {
  async get(keys) {
    if (hasExtStorage) return chrome.storage.local.get(keys);
    const out = {};
    for (const key of keys) {
      const raw = localStorage.getItem('cursor-closet:' + key);
      if (raw != null) out[key] = JSON.parse(raw);
    }
    return out;
  },
  async set(items) {
    if (hasExtStorage) return chrome.storage.local.set(items);
    for (const [key, value] of Object.entries(items)) {
      localStorage.setItem('cursor-closet:' + key, JSON.stringify(value));
    }
  },
  onChange(fn) {
    if (hasExtStorage) chrome.storage.onChanged.addListener((changes, area) => area === 'local' && fn(changes));
  },
};

async function loadState() {
  return { ...DEFAULT_STATE, ...(await store.get(Object.keys(DEFAULT_STATE))) };
}

// The content script only reads `enabled` and `active`, a compact copy of the chosen set,
// so pages never have to load the whole library.
async function saveState(state) {
  await store.set({
    enabled: state.enabled,
    activeId: state.activeId,
    library: state.library,
    active: compileActive(state),
  });
}

function compileActive(state) {
  const set = state.library.find((s) => s.id === state.activeId);
  if (!set?.slots.default) return null;
  const active = { keepTextCursor: set.keepTextCursor !== false };
  for (const key of SLOT_KEYS) {
    const slot = set.slots[key];
    if (slot) active[key] = { x1: slot.x1, x2: slot.x2, ...hotspotPx(slot) };
  }
  return active;
}

// Hotspots are stored as fractions so they survive size changes.
function hotspotPx(slot) {
  const clamp = (f, max) => Math.min(max - 1, Math.max(0, Math.floor(f * max)));
  return { hx: clamp(slot.hx, slot.w), hy: clamp(slot.hy, slot.h) };
}

function newSet(name) {
  return { id: crypto.randomUUID(), name, size: 32, keepTextCursor: true, slots: {} };
}

function stateCount(set) {
  return SLOT_KEYS.filter((k) => set.slots[k]).length;
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------- Turning uploads into cursor-ready PNGs ----------

async function readUpload(file) {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!isSvg && !/^image\/(png|webp|gif|jpeg)$/.test(file.type)) {
    throw new Error('Use a PNG or SVG file.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('That file is over 5 MB. Try a smaller export.');
  if (isSvg) return { kind: 'svg', src: await file.text() };
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { kind: 'bitmap', src };
}

// Renders the upload at 1x and 2x (for Retina screens), fitted inside a size×size box.
async function renderSlot(src, kind, size) {
  if (kind === 'svg') {
    const { svg, vw, vh } = parseSvg(src);
    const { w, h } = fit(vw, vh, size);
    const [x1, x2] = await Promise.all(
      [1, 2].map(async (s) => toPng(await loadImage(svgUrl(svg, w * s, h * s)), w * s, h * s)),
    );
    return { w, h, x1, x2 };
  }
  const img = await loadImage(src);
  const { w, h } = fit(img.naturalWidth, img.naturalHeight, size);
  return { w, h, x1: toPng(img, w, h), x2: toPng(img, w * 2, h * 2) };
}

function fit(iw, ih, box) {
  if (!(iw > 0 && ih > 0)) iw = ih = 1;
  const scale = box / Math.max(iw, ih);
  return { w: Math.max(1, Math.round(iw * scale)), h: Math.max(1, Math.round(ih * scale)) };
}

function parseSvg(text) {
  if (!/<svg[^>]*\sxmlns=/.test(text)) text = text.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.namespaceURI !== SVG_NS || svg.localName !== 'svg') throw new Error('That SVG couldn’t be read.');

  const len = (name) => {
    const value = svg.getAttribute(name) || '';
    return value.includes('%') ? NaN : parseFloat(value);
  };
  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let vw = len('width');
  let vh = len('height');
  if (!(vw > 0 && vh > 0) && box.length === 4 && box[2] > 0 && box[3] > 0) [vw, vh] = [box[2], box[3]];
  if (!(vw > 0 && vh > 0)) vw = vh = 1;
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  return { svg, vw, vh };
}

function svgUrl(svg, w, h) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('width', w);
  copy.setAttribute('height', h);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
}

async function loadImage(url) {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error('That image couldn’t be opened.');
  }
  return img;
}

function toPng(img, w, h) {
  let source = img;
  let sw = img.naturalWidth || w;
  let sh = img.naturalHeight || h;
  // Halve big images in steps so they shrink cleanly instead of shimmering.
  while (sw / 2 >= w && sh / 2 >= h) {
    const step = canvasOf(Math.floor(sw / 2), Math.floor(sh / 2));
    step.ctx.imageSmoothingQuality = 'high';
    step.ctx.drawImage(source, 0, 0, step.canvas.width, step.canvas.height);
    source = step.canvas;
    sw = step.canvas.width;
    sh = step.canvas.height;
  }
  const out = canvasOf(w, h);
  // Upscaling small bitmaps stays crisp, which suits pixel-art cursors.
  out.ctx.imageSmoothingEnabled = sw > w;
  out.ctx.imageSmoothingQuality = 'high';
  out.ctx.drawImage(source, 0, 0, w, h);
  return out.canvas.toDataURL('image/png');
}

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}
