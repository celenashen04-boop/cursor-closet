let state;

const list = document.getElementById('sets');
const enabledInput = document.getElementById('enabled');
const statusEl = document.getElementById('status');

init();

async function init() {
  state = await loadState();
  render();
}

function render() {
  const active = state.library.find((s) => s.id === state.activeId);
  enabledInput.checked = state.enabled;
  document.body.classList.toggle('is-off', !state.enabled);

  if (!state.enabled) statusEl.textContent = 'Off: sites show your normal cursor.';
  else if (active) statusEl.textContent = `Showing “${active.name}” on every site.`;
  else statusEl.textContent = 'Pick a set to start using it.';

  if (!state.library.length) {
    list.innerHTML = `<li class="empty">
      <strong>Your closet is empty</strong>
      <p class="note">Upload PNG or SVG designs for default, hover and click.</p>
      <button class="btn btn-primary" type="button" data-new>Upload designs</button>
    </li>`;
    return;
  }

  list.innerHTML = state.library.map((set) => {
    const thumbs = SLOT_KEYS.map((key) => {
      const slot = set.slots[key];
      return slot
        ? `<span class="thumb checker" title="${key}"><img src="${slot.x2}" alt="" width="${Math.min(28, slot.w)}"></span>`
        : `<span class="thumb empty" title="No ${key} design"></span>`;
    }).join('');
    const ready = !!set.slots.default;
    return `<li>
      <button class="set-card ${set.id === state.activeId ? 'is-active' : ''}" type="button" data-id="${set.id}" ${ready ? '' : 'disabled'}>
        <span class="thumbs">${thumbs}</span>
        <span class="set-text">
          <span class="set-name">${esc(set.name)}</span>
          <span class="set-meta label">${ready ? `${set.size}px · ${stateCount(set)} state${stateCount(set) === 1 ? "" : "s"}` : 'Needs a default design'}</span>
        </span>
        <span class="check" aria-hidden="true"></span>
      </button>
    </li>`;
  }).join('');
}

list.addEventListener('click', async (e) => {
  if (e.target.closest('[data-new]')) return openManager(true);
  const card = e.target.closest('.set-card');
  if (!card) return;
  state.activeId = card.dataset.id;
  state.enabled = true;
  await saveState(state);
  render();
});

enabledInput.addEventListener('change', async () => {
  state.enabled = enabledInput.checked;
  await saveState(state);
  render();
});

document.getElementById('manage').addEventListener('click', () => openManager(false));
document.getElementById('add').addEventListener('click', () => openManager(true));

function openManager(createNew) {
  const url = 'manager.html' + (createNew ? '?new=1' : '');
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL(url) });
    window.close();
  } else {
    location.href = url;
  }
}
