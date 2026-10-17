let state;
let openId = null;

const $ = (id) => document.getElementById(id);
const dialog = $('editorDialog');
const editor = $('editor');

const SLOT_INFO = {
  default: { title: 'Default', hint: 'Everywhere', empty: 'Required' },
  hover: { title: 'Hover', hint: 'Links & buttons', empty: 'Optional · uses Default if empty' },
  click: { title: 'Click', hint: 'While pressing', empty: 'Optional · no change on click if empty' },
};
const ICON = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const REPLACE_ICON = ICON('<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>');
const TRASH_ICON = ICON('<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"/>');
const UPLOAD_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

init();

async function init() {
  state = await loadState();
  renderCloset();
  if (new URLSearchParams(location.search).has('new')) {
    history.replaceState(null, '', location.pathname);
    await createAndOpen();
  }

  // Keep in sync when the popup changes things while this tab is open.
  store.onChange((changes) => {
    let changed = false;
    for (const key of ['enabled', 'activeId']) {
      if (key in changes && changes[key].newValue !== state[key]) {
        state[key] = changes[key].newValue;
        changed = true;
      }
    }
    if (changed) renderCloset();
  });
}

const findSet = (id) => state.library.find((s) => s.id === id);
const current = () => findSet(openId);

function nextName() {
  let n = state.library.length + 1;
  while (state.library.some((s) => s.name === `Set ${n}`)) n++;
  return `Set ${n}`;
}

async function createAndOpen() {
  const set = newSet(nextName());
  state.library.push(set);
  await saveState(state);
  renderCloset();
  openEditor(set.id);
  $('setName').select();
}

// ---------- Closet list ----------

function renderCloset() {
  const active = findSet(state.activeId);
  $('enabled').checked = state.enabled;
  $('powerNote').textContent = state.enabled ? 'Custom cursors on' : 'Custom cursors off';
  $('closetNote').textContent = !state.library.length
    ? 'Create a set to upload your cursor designs.'
    : !state.enabled
      ? 'Turned off. Sites show your normal cursor.'
      : active ? `Showing “${active.name}” on every site.` : 'Select a set to start using it.';

  if (!state.library.length) {
    $('setList').innerHTML = `<li class="blank">
      <div class="blank-art"><span>Default</span><span>Hover</span><span>Click</span></div>
      <strong>Your closet is empty</strong>
      <p class="note">Click “+ New set” to upload a PNG or SVG for each state, or import a set someone shared with you.</p>
    </li>`;
    return;
  }

  $('setList').innerHTML = state.library.map((set) => {
    const isActive = set.id === state.activeId;
    const ready = !!set.slots.default;
    const thumbs = SLOT_KEYS.map((key) => {
      const slot = set.slots[key];
      return slot
        ? `<span class="thumb checker" title="${SLOT_INFO[key].title}"><img src="${slot.x2}" alt="" width="${Math.min(30, slot.w)}"></span>`
        : `<span class="thumb empty" title="No ${SLOT_INFO[key].title.toLowerCase()} design"></span>`;
    }).join('');
    const count = stateCount(set);
    return `<li class="set-row ${isActive ? 'is-active' : ''}" data-id="${set.id}">
      <button class="row-main" type="button" aria-pressed="${isActive}" title="${ready ? 'Use this set' : 'Add a default design first'}">
        <span class="thumbs">${thumbs}</span>
        <span class="row-text">
          <span class="row-name">${esc(set.name)}</span>
          <span class="label">${ready ? `${set.size}px · ${count} state${count === 1 ? '' : 's'}` : 'Needs a default design'}${isActive ? ' · <b>In use</b>' : ''}</span>
        </span>
      </button>
      <div class="row-actions">
        <button class="chip" type="button" data-act="view">View</button>
        <button class="chip" type="button" data-act="export">Export</button>
      </div>
    </li>`;
  }).join('');
}

// Clicking anywhere on a set (except its buttons) selects it.
$('setList').addEventListener('click', async (e) => {
  const set = findSet(e.target.closest('[data-id]')?.dataset.id);
  if (!set) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'view') return openEditor(set.id);
  if (act === 'export') return exportSet(set);
  if (set.id === state.activeId && state.enabled) return;
  if (!set.slots.default) return toast('Add a default design first. Click View to upload one.');
  state.activeId = set.id;
  state.enabled = true;
  await saveState(state);
  renderCloset();
  toast(`Now using “${set.name}” on every site`);
});

$('newSet').addEventListener('click', createAndOpen);

$('enabled').addEventListener('change', async (e) => {
  state.enabled = e.target.checked;
  await saveState(state);
  renderCloset();
});

// ---------- Import / export ----------

function exportSet(set) {
  const data = { app: 'cursor-closet', version: 1, sets: [set] };
  const slug = set.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cursor-set';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `${slug}.cursor-closet.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data?.app !== 'cursor-closet' || !Array.isArray(data.sets)) throw new Error();
    let added = 0;
    for (const raw of data.sets) {
      const set = newSet(String(raw.name || 'Imported set').slice(0, 60));
      set.size = SIZES.includes(raw.size) ? raw.size : 32;
      set.keepTextCursor = raw.keepTextCursor !== false;
      for (const key of SLOT_KEYS) {
        const slot = raw.slots?.[key];
        if (!slot || !['svg', 'bitmap'].includes(slot.kind) || typeof slot.src !== 'string') continue;
        // Re-render from the original rather than trusting the stored PNGs.
        set.slots[key] = {
          kind: slot.kind,
          src: slot.src,
          fileName: slot.fileName,
          hx: Number(slot.hx) || 0,
          hy: Number(slot.hy) || 0,
          ...(await renderSlot(slot.src, slot.kind, set.size)),
        };
      }
      state.library.push(set);
      added++;
    }
    await saveState(state);
    renderCloset();
    toast(`Imported ${added} set${added === 1 ? '' : 's'}`);
  } catch {
    toast('That isn’t a Cursor Closet file.');
  }
});

// ---------- Editor pop-up ----------

function openEditor(id) {
  openId = id;
  renderEditor();
  if (!dialog.open) dialog.showModal();
  editor.scrollTop = 0;
}

function closeEditor() {
  if (dialog.open) dialog.close();
}

dialog.addEventListener('close', () => {
  // The close event fires a moment later; skip cleanup if a set was reopened meanwhile.
  if (dialog.open) return;
  clearTimeout(nameTimer);
  saveState(state);
  openId = null;
  editor.innerHTML = '';
  $('pg-style').textContent = '';
  renderCloset();
});

// Clicking the dimmed backdrop closes the pop-up.
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) closeEditor();
});

function renderEditor() {
  const set = current();
  if (!set) return closeEditor();
  editor.innerHTML = `
    <header class="ed-head">
      <div class="ed-title">
        <span class="label">Cursor set</span>
        <input class="ed-name" id="setName" value="${esc(set.name)}" aria-label="Set name" spellcheck="false" maxlength="60">
      </div>
      <div class="ed-actions">
        <button class="btn btn-ghost danger" type="button" data-act="delete">${TRASH_ICON} Delete set</button>
        <button class="btn btn-primary" type="button" data-act="close" autofocus>Done</button>
      </div>
    </header>

    <section class="slots">${SLOT_KEYS.map((key) => slotHtml(set, key)).join('')}</section>

    <section class="panel options">
      <div class="option">
        <label class="label" for="sizeSelect">Size</label>
        <div class="select">
          <select id="sizeSelect">
            ${SIZES.map((s) => `<option value="${s}" ${s === set.size ? 'selected' : ''}>${s} × ${s} px</option>`).join('')}
          </select>
        </div>
      </div>
      <label class="checkline" title="The I-beam is the thin vertical text cursor you see when typing.">
        <input type="checkbox" id="keepText" ${set.keepTextCursor !== false ? 'checked' : ''}>
        <span>Keep the normal I-beam in text fields</span>
      </label>
      <p class="note">32px matches a normal cursor. Chrome allows up to 128px, but anything over 32px switches back to the normal arrow near the edges of the window.</p>
    </section>

    <section class="panel">
      <div class="panel-head"><span class="label">Test area</span><span class="note">Try this set here</span></div>
      <div class="playground" id="playground">
        <p>Move over this text for the default cursor. Hover <a href="#" data-pg>this link</a> or the button to see hover, then press and hold to see click.</p>
        <div class="pg-row">
          <button class="btn btn-primary" type="button" data-pg>A button</button>
          <input type="text" placeholder="A text field">
        </div>
      </div>
    </section>`;
  renderPlayground();
}

function slotHtml(set, key) {
  const slot = set.slots[key];
  const info = SLOT_INFO[key];
  const accept = '.png,.svg,image/png,image/svg+xml,image/webp';
  if (!slot) {
    return `<article class="slot" data-slot="${key}">
      <header class="slot-head"><span class="slot-title">${info.title}</span><span class="label">${info.hint}</span></header>
      <div class="stage" data-browse tabindex="0" role="button" aria-label="Upload ${info.title} design">
        <div class="stage-empty">${UPLOAD_ICON}<strong>Drop a PNG or SVG</strong><span>or click to browse</span></div>
      </div>
      <footer class="slot-foot"><span class="hint">${info.empty}</span></footer>
      <input type="file" accept="${accept}" hidden>
    </article>`;
  }
  const zoom = Math.max(1, Math.min(4, Math.floor(150 / Math.max(slot.w, slot.h))));
  const { hx, hy } = hotspotPx(slot);
  return `<article class="slot" data-slot="${key}">
    <header class="slot-head"><span class="slot-title">${info.title}</span><span class="label">${info.hint}</span></header>
    <div class="stage checker has-image">
      <div class="stage-frame" style="--w:${slot.w};--h:${slot.h};--z:${zoom}" title="Click or drag to set where it clicks">
        <img src="${slot.x2}" alt="${info.title} cursor" draggable="false">
        <span class="hotspot" style="${hotspotPos(slot)}"></span>
      </div>
    </div>
    <footer class="slot-foot">
      <span class="hint" data-hot-label>${hotspotLabel(hx, hy)}</span>
      <div class="mini-actions">
        <div class="mini-group" aria-label="Hotspot presets">
          <button class="chip" type="button" data-act="hot-corner">Top-left</button>
          <button class="chip" type="button" data-act="hot-center">Center</button>
        </div>
        <div class="mini-group">
          <button class="chip icon-only" type="button" data-act="replace" title="Replace ${info.title.toLowerCase()} design" aria-label="Replace ${info.title.toLowerCase()} design">${REPLACE_ICON}</button>
          <button class="chip icon-only danger" type="button" data-act="remove" title="Remove ${info.title.toLowerCase()} design" aria-label="Remove ${info.title.toLowerCase()} design">${TRASH_ICON}</button>
        </div>
      </div>
    </footer>
    <input type="file" accept="${accept}" hidden>
  </article>`;
}

function hotspotLabel(hx, hy) {
  return `Clicks at ${hx}, ${hy} · click the image to move it`;
}

function hotspotPos(slot) {
  const { hx, hy } = hotspotPx(slot);
  return `left:${((hx + 0.5) / slot.w) * 100}%;top:${((hy + 0.5) / slot.h) * 100}%`;
}

// The extension can't run on its own pages, so the test area gets plain CSS instead.
function renderPlayground() {
  const set = current();
  const d = set?.slots.default;
  if (!d) {
    $('pg-style').textContent = '';
    return;
  }
  const decl = (slot, fallback) => {
    const { hx, hy } = hotspotPx(slot);
    return `cursor: url("${slot.x1}") ${hx} ${hy}, ${fallback}; cursor: image-set(url("${slot.x1}") 1x, url("${slot.x2}") 2x) ${hx} ${hy}, ${fallback};`;
  };
  const h = set.slots.hover || d;
  const c = set.slots.click;
  $('pg-style').textContent = `
    #playground, #playground * { ${decl(d, 'default')} }
    #playground [data-pg], #playground [data-pg] * { ${decl(h, 'pointer')} }
    ${set.keepTextCursor !== false ? '#playground input { cursor: text; }' : ''}
    ${c ? `#playground:active, #playground :active { ${decl(c, 'default')} }` : ''}`;
}

async function handleFile(key, file) {
  const set = current();
  const stage = editor.querySelector(`[data-slot="${key}"] .stage`);
  stage?.classList.add('is-busy');
  try {
    const { kind, src } = await readUpload(file);
    const rendered = await renderSlot(src, kind, set.size);
    const prev = set.slots[key];
    set.slots[key] = { kind, src, fileName: file.name, hx: prev?.hx ?? 0, hy: prev?.hy ?? 0, ...rendered };
    if (!state.activeId && key === 'default') state.activeId = set.id;
    await saveState(state);
    renderEditor();
    toast(`${SLOT_INFO[key].title} design added`);
  } catch (err) {
    stage?.classList.remove('is-busy');
    toast(err.message || 'That file couldn’t be used.');
  }
}

async function resize(size) {
  const set = current();
  if (set.size === size) return;
  set.size = size;
  editor.querySelectorAll('.stage.has-image').forEach((el) => el.classList.add('is-busy'));
  for (const key of SLOT_KEYS) {
    const slot = set.slots[key];
    if (slot) Object.assign(slot, await renderSlot(slot.src, slot.kind, size));
  }
  await saveState(state);
  renderEditor();
}

function setHotspot(key, fx, fy) {
  const slot = current().slots[key];
  slot.hx = (Math.min(slot.w - 1, Math.max(0, Math.floor(fx * slot.w))) + 0.5) / slot.w;
  slot.hy = (Math.min(slot.h - 1, Math.max(0, Math.floor(fy * slot.h))) + 0.5) / slot.h;
  const card = editor.querySelector(`[data-slot="${key}"]`);
  const { hx, hy } = hotspotPx(slot);
  card.querySelector('.hotspot').style.cssText = hotspotPos(slot);
  card.querySelector('[data-hot-label]').textContent = hotspotLabel(hx, hy);
}

editor.addEventListener('click', async (e) => {
  const target = e.target;
  const slotEl = target.closest('.slot');
  const key = slotEl?.dataset.slot;
  const act = target.closest('[data-act]')?.dataset.act;

  if (target.closest('[data-browse]') || act === 'replace') return slotEl.querySelector('input[type=file]').click();
  if (target.closest('[data-pg]')) return e.preventDefault();

  switch (act) {
    case 'close':
      return closeEditor();
    case 'delete': {
      const set = current();
      if (!confirm(`Delete “${set.name}”? This can’t be undone.`)) return;
      state.library = state.library.filter((s) => s !== set);
      if (state.activeId === set.id) state.activeId = null;
      await saveState(state);
      closeEditor();
      return toast(`Deleted “${set.name}”`);
    }
    case 'remove':
      delete current().slots[key];
      await saveState(state);
      return renderEditor();
    case 'hot-corner':
    case 'hot-center': {
      const f = act === 'hot-corner' ? 0 : 0.5;
      setHotspot(key, f, f);
      await saveState(state);
      return renderPlayground();
    }
  }
});

editor.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-browse]')) {
    e.preventDefault();
    e.target.closest('.slot').querySelector('input[type=file]').click();
  }
});

editor.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'sizeSelect') return resize(Number(el.value));
  if (el.id === 'keepText') {
    current().keepTextCursor = el.checked;
    await saveState(state);
    return renderPlayground();
  }
  if (el.matches('.slot input[type=file]') && el.files[0]) {
    handleFile(el.closest('.slot').dataset.slot, el.files[0]);
  }
});

let nameTimer;
editor.addEventListener('input', (e) => {
  if (e.target.id !== 'setName') return;
  current().name = e.target.value.trim() || 'Untitled set';
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => saveState(state), 300);
});

// Click or drag on the preview to place the hotspot.
editor.addEventListener('pointerdown', (e) => {
  const frame = e.target.closest('.stage-frame');
  if (!frame) return;
  e.preventDefault();
  const key = frame.closest('.slot').dataset.slot;
  const place = (ev) => {
    const r = frame.getBoundingClientRect();
    setHotspot(key, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
  };
  place(e);
  frame.setPointerCapture(e.pointerId);
  frame.onpointermove = place;
  frame.onpointerup = () => {
    frame.onpointermove = frame.onpointerup = null;
    saveState(state);
    renderPlayground();
  };
});

// Drag and drop onto any slot card.
const clearDragover = () => editor.querySelectorAll('.is-dragover').forEach((el) => el.classList.remove('is-dragover'));
editor.addEventListener('dragover', (e) => {
  const slotEl = e.target.closest('.slot');
  if (!slotEl) return;
  e.preventDefault();
  clearDragover();
  slotEl.querySelector('.stage').classList.add('is-dragover');
});
editor.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !editor.contains(e.relatedTarget)) clearDragover();
});
editor.addEventListener('drop', (e) => {
  const slotEl = e.target.closest('.slot');
  clearDragover();
  if (!slotEl) return;
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(slotEl.dataset.slot, file);
});
// Stop stray drops from navigating the tab to the image.
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => e.preventDefault());

let toastTimer;
function toast(message) {
  const el = $('toast');
  // The pop-up sits in the browser's top layer, so the toast has to live inside it while it's open.
  (dialog.open ? dialog : document.body).appendChild(el);
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
