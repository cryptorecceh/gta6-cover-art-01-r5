// app/src/main.js — Vice City Cover Studio UI + state (R5)
// State, undo/redo, controls, photos, pointer, shortcuts, ?shot= scenes,
// window.__vc hook. Rendering is delegated to cover.js (drawCover).
// Deterministic render: this module never feeds unseeded randomness into
// the canvas; shuffle is a user action and uses Math.random only to pick
// a preset (the rendered state itself is fully deterministic).

import {
  VERSION,
  LAYOUTS,
  GRADES,
  FILTERS,
  SIZES,
  layoutPanels,
  drawCover,
} from './cover.js';
import { exportCover, exportAll, slugify } from './export.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_PHOTOS = ['samples/boulevard.jpg', 'samples/pier.jpg'];

const SHUFFLE_CAPTIONS = [
  'SUNSET HEIST',
  'NEON COAST',
  'VICE CITY',
  'OCEAN DRIVE',
  'MIDNIGHT RUN',
  'PALM SHADOWS',
  'TURBO SUNSET',
  'CHROME DREAMS',
];

// ?shot= presets (used by the screenshot session). Deterministic.
const SHOTS = {
  trio: { layout: 'Trio', grade: 'Sunset', caption: 'SUNSET HEIST' },
  editor: { layout: 'Trio', grade: 'Neon', caption: 'NEON COAST' },
  frame: { layout: 'Frame', grade: 'Ocean Drive', caption: 'OCEAN DRIVE' },
  banner: { layout: 'Banner', grade: 'Pastel', caption: 'PASTEL PALMS' },
  quad: { layout: 'Quad', grade: 'Midnight', caption: 'MIDNIGHT RUN' },
  solo: { layout: 'Solo', grade: 'Sunset', caption: 'VICE CITY' },
  duo: { layout: 'Duo', grade: 'Neon', caption: 'CHROME DREAMS' },
  strip: { layout: 'Strip', grade: 'Pastel', caption: 'PALM SHADOWS' },
};

const DEFAULT_CAPTION = 'SUNSET HEIST';
const MAX_HISTORY = 50;
const COALESCE_MS = 600;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function defaultPanel() {
  return { photo: null, filter: 'None', panX: 0, panY: 0, zoom: 1, fit: 'Fill' };
}

export function panelCount(layout) {
  return layoutPanels(layout, 1080, 1080).length;
}

function defaultState() {
  const layout = 'Trio';
  const panels = [];
  for (let i = 0; i < panelCount(layout); i++) panels.push(defaultPanel());
  return {
    layout,
    grade: 'Sunset',
    caption: DEFAULT_CAPTION,
    titleSize: 1,
    tracking: 2,
    panels,
    size: { w: 1080, h: 1080 }, // view setting, excluded from undo history
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Normalize + clamp in place. Never throws; unknown values fall back.
function normalizeState(s) {
  if (!LAYOUTS.includes(s.layout)) s.layout = 'Trio';
  if (!GRADES.includes(s.grade)) s.grade = 'Sunset';
  s.caption = typeof s.caption === 'string' ? s.caption : DEFAULT_CAPTION;
  s.titleSize = clamp(Number(s.titleSize) || 1, 0.7, 1.3);
  s.tracking = clamp(Number(s.tracking) || 0, -2, 12);
  if (!Array.isArray(s.panels)) s.panels = [];
  const n = panelCount(s.layout);
  while (s.panels.length < n) s.panels.push(defaultPanel());
  while (s.panels.length > n) s.panels.pop();
  for (const p of s.panels) {
    if (!FILTERS.includes(p.filter)) p.filter = 'None';
    p.fit = p.fit === 'Fit' ? 'Fit' : 'Fill';
    p.panX = clamp(Number(p.panX) || 0, -0.5, 0.5);
    p.panY = clamp(Number(p.panY) || 0, -0.5, 0.5);
    p.zoom = clamp(Number(p.zoom) || 1, 0.5, 3);
    if (!('photo' in p)) p.photo = null;
  }
  if (!s.size || !Number.isFinite(s.size.w) || !Number.isFinite(s.size.h)) {
    s.size = { w: 1080, h: 1080 };
  }
  return s;
}

const state = defaultState();
let selectedPanel = 0;

// ---------------------------------------------------------------------------
// History (undo/redo) — snapshots share photo references (Images are never
// mutated), so a snapshot is a cheap shallow copy of settings + panels.
// Coalescing ONLY for continuous values (titleSize/tracking/pan/zoom):
// consecutive continuous changes within COALESCE_MS collapse to one step,
// so a slider drag undoes in a single Ctrl+Z.
// ---------------------------------------------------------------------------

const past = [];
const future = [];
let lastBegin = { kind: null, time: 0 };

function snapshot() {
  return {
    layout: state.layout,
    grade: state.grade,
    caption: state.caption,
    titleSize: state.titleSize,
    tracking: state.tracking,
    panels: state.panels.map((p) => ({ ...p })),
  };
}

function restore(snap) {
  state.layout = snap.layout;
  state.grade = snap.grade;
  state.caption = snap.caption;
  state.titleSize = snap.titleSize;
  state.tracking = snap.tracking;
  state.panels = snap.panels.map((p) => ({ ...p }));
  selectedPanel = clamp(selectedPanel, 0, state.panels.length - 1);
}

// kind: 'discrete' | 'continuous'. Call BEFORE mutating state.
function beginChange(kind) {
  const now = Date.now();
  const coalesce =
    kind === 'continuous' &&
    lastBegin.kind === 'continuous' &&
    now - lastBegin.time < COALESCE_MS;
  if (!coalesce) {
    past.push(snapshot());
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
  }
  lastBegin = { kind, time: now };
}

export function undo() {
  if (!past.length) return false;
  future.push(snapshot());
  restore(past.pop());
  applyState();
  return true;
}

export function redo() {
  if (!future.length) return false;
  past.push(snapshot());
  restore(future.pop());
  applyState();
  return true;
}

// ---------------------------------------------------------------------------
// Mutation entry point: every state change goes through mutate().
// ---------------------------------------------------------------------------

function mutate(kind, fn) {
  beginChange(kind);
  fn(state);
  applyState();
}

export function applyState() {
  normalizeState(state);
  render();
  syncUI();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  const canvas = $('stage');
  if (!canvas) return;
  const { w, h } = state.size;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawCover(ctx, state, w, h);
  drawSelection(ctx, w, h);
}

function drawSelection(ctx, W, H) {
  const rects = layoutPanels(state.layout, W, H);
  const rect = rects[selectedPanel];
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, W * 0.004);
  ctx.setLineDash([Math.max(8, W * 0.012), Math.max(6, W * 0.008)]);
  if (rect.inset) {
    const tilt = ((rect.tilt || -4) * Math.PI) / 180;
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(tilt);
    ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
  } else {
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function setLayout(layout) {
  if (!LAYOUTS.includes(layout)) return;
  mutate('discrete', (s) => {
    s.layout = layout;
  });
  selectedPanel = 0;
  applyState();
}

export function setGrade(grade) {
  if (!GRADES.includes(grade)) return;
  mutate('discrete', (s) => {
    s.grade = grade;
  });
}

export function setCaption(text) {
  mutate('discrete', (s) => {
    s.caption = String(text == null ? '' : text);
  });
}

export function setTitleSize(v) {
  mutate('continuous', (s) => {
    s.titleSize = clamp(Number(v) || 1, 0.7, 1.3);
  });
}

export function setTracking(v) {
  mutate('continuous', (s) => {
    s.tracking = clamp(Math.round(Number(v) || 0), -2, 12);
  });
}

export function setFilter(filter) {
  if (!FILTERS.includes(filter)) return;
  mutate('discrete', (s) => {
    s.panels[selectedPanel].filter = filter;
  });
}

export function setFit(fit) {
  mutate('discrete', (s) => {
    s.panels[selectedPanel].fit = fit === 'Fit' ? 'Fit' : 'Fill';
  });
}

export function setZoom(v) {
  mutate('continuous', (s) => {
    s.panels[selectedPanel].zoom = clamp(Number(v) || 1, 0.5, 3);
  });
}

export function setPan(x, y) {
  mutate('continuous', (s) => {
    s.panels[selectedPanel].panX = clamp(Number(x) || 0, -0.5, 0.5);
    s.panels[selectedPanel].panY = clamp(Number(y) || 0, -0.5, 0.5);
  });
}

export function selectPanel(i) {
  const n = state.panels.length;
  selectedPanel = clamp(Math.round(Number(i) || 0), 0, Math.max(0, n - 1));
  render();
  syncUI();
}

export function shuffle() {
  const layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
  const grade = GRADES[Math.floor(Math.random() * GRADES.length)];
  const caption =
    SHUFFLE_CAPTIONS[Math.floor(Math.random() * SHUFFLE_CAPTIONS.length)];
  mutate('discrete', (s) => {
    s.layout = layout;
    s.grade = grade;
    s.caption = caption;
  });
  selectedPanel = 0;
  applyState();
}

export function setSize(w, h) {
  const cw = clamp(Math.round(Number(w) || 1080), 240, 3840);
  const ch = clamp(Math.round(Number(h) || 1080), 240, 3840);
  state.size = { w: cw, h: ch };
  render();
  syncUI();
}

function setSizeByIndex(i) {
  const s = SIZES[clamp(Math.round(Number(i) || 0), 0, SIZES.length - 1)];
  setSize(s.w, s.h);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadSamplePhotos() {
  const jobs = SAMPLE_PHOTOS.map((src) => loadImage(src));
  const imgs = await Promise.all(jobs);
  let changed = false;
  imgs.forEach((img, i) => {
    if (img && state.panels[i] && !state.panels[i].photo) {
      state.panels[i].photo = img;
      changed = true;
    }
  });
  if (changed) render();
}

function assignPhotoFiles(files, startPanel) {
  const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
  if (!list.length) return;
  let idx = clamp(startPanel == null ? selectedPanel : startPanel, 0, state.panels.length - 1);
  beginChange('discrete');
  list.forEach((file) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      render();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    if (state.panels[idx]) state.panels[idx].photo = img;
    idx = (idx + 1) % state.panels.length;
  });
  applyState();
}

function removePhoto() {
  mutate('discrete', (s) => {
    s.panels[selectedPanel].photo = null;
  });
}

// ---------------------------------------------------------------------------
// UI build + sync
// ---------------------------------------------------------------------------

function buildButtons(container, items, active, onPick) {
  if (!container) return;
  container.innerHTML = '';
  items.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item;
    b.dataset.value = item;
    b.dataset.index = String(i);
    if (item === active) b.classList.add('active');
    b.addEventListener('click', () => onPick(item, i));
    container.appendChild(b);
  });
}

// Toggle the active button without rebuilding (rebuilding on every state
// change would destroy a slider mid-drag).
function syncButtons(container, active) {
  if (!container) return;
  container.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === active);
  });
}

function buildLayoutButtons() {
  buildButtons($('layout-bar'), LAYOUTS, state.layout, (item) => setLayout(item));
}

function buildGradeButtons() {
  buildButtons($('grade-bar'), GRADES, state.grade, (item) => setGrade(item));
}

let panelControlsKey = '';

// Build the selected-panel controls. Rebuilds ONLY when the selected panel
// or the panel count changes — rebuilding on every state change would
// destroy a slider while the user is dragging it.
function buildPanelControls() {
  const bar = $('panel-bar');
  if (!bar) return;
  const key = `${selectedPanel}:${state.panels.length}`;
  if (key === panelControlsKey && bar.children.length) return;
  panelControlsKey = key;
  bar.innerHTML = '';
  const label = document.createElement('div');
  label.id = 'panel-label';
  label.textContent = `Panel ${selectedPanel + 1} / ${state.panels.length}`;
  bar.appendChild(label);

  const p = state.panels[selectedPanel] || defaultPanel();

  const mkRow = (text, el) => {
    const row = document.createElement('div');
    row.className = 'ctl-row';
    const lab = document.createElement('label');
    lab.textContent = text;
    row.appendChild(lab);
    row.appendChild(el);
    bar.appendChild(row);
  };

  const filterSel = document.createElement('select');
  filterSel.id = 'panel-filter';
  FILTERS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f;
    filterSel.appendChild(o);
  });
  filterSel.value = p.filter;
  filterSel.addEventListener('change', () => setFilter(filterSel.value));
  mkRow('Filter', filterSel);

  const fitSel = document.createElement('select');
  fitSel.id = 'panel-fit';
  ['Fill', 'Fit'].forEach((f) => {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = f;
    fitSel.appendChild(o);
  });
  fitSel.value = p.fit;
  fitSel.addEventListener('change', () => setFit(fitSel.value));
  mkRow('Fit', fitSel);

  const zoom = document.createElement('input');
  zoom.id = 'panel-zoom';
  zoom.type = 'range';
  zoom.min = '0.5';
  zoom.max = '3';
  zoom.step = '0.05';
  zoom.value = String(p.zoom);
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  mkRow('Zoom', zoom);

  const panX = document.createElement('input');
  panX.id = 'panel-panx';
  panX.type = 'range';
  panX.min = '-0.5';
  panX.max = '0.5';
  panX.step = '0.01';
  panX.value = String(p.panX);
  panX.addEventListener('input', () => setPan(Number(panX.value), state.panels[selectedPanel].panY));
  mkRow('Pan X', panX);

  const panY = document.createElement('input');
  panY.id = 'panel-pany';
  panY.type = 'range';
  panY.min = '-0.5';
  panY.max = '0.5';
  panY.step = '0.01';
  panY.value = String(p.panY);
  panY.addEventListener('input', () => setPan(state.panels[selectedPanel].panX, Number(panY.value)));
  mkRow('Pan Y', panY);

  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.textContent = 'Add photo';
  pickBtn.addEventListener('click', () => {
    const input = $('photo-input');
    if (input) input.click();
  });
  bar.appendChild(pickBtn);

  const rmBtn = document.createElement('button');
  rmBtn.type = 'button';
  rmBtn.textContent = 'Remove photo';
  rmBtn.addEventListener('click', removePhoto);
  bar.appendChild(rmBtn);

  const picker = document.createElement('div');
  picker.className = 'panel-picker';
  state.panels.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(i + 1);
    if (i === selectedPanel) b.classList.add('active');
    b.addEventListener('click', () => selectPanel(i));
    picker.appendChild(b);
  });
  bar.appendChild(picker);
}

// Update control values in place (no rebuild) so a slider drag is never
// interrupted by a DOM recreation.
function syncPanelValues() {
  const p = state.panels[selectedPanel] || defaultPanel();
  const setVal = (id, v) => {
    const el = $(id);
    if (el && el.value !== String(v)) el.value = String(v);
  };
  setVal('panel-filter', p.filter);
  setVal('panel-fit', p.fit);
  setVal('panel-zoom', p.zoom);
  setVal('panel-panx', p.panX);
  setVal('panel-pany', p.panY);
  const label = $('panel-label');
  if (label) label.textContent = `Panel ${selectedPanel + 1} / ${state.panels.length}`;
  const bar = $('panel-bar');
  if (bar) {
    bar.querySelectorAll('.panel-picker button').forEach((b, i) => {
      b.classList.toggle('active', i === selectedPanel);
    });
  }
}

function syncUI() {
  syncButtons($('layout-bar'), state.layout);
  syncButtons($('grade-bar'), state.grade);
  buildPanelControls(); // no-op unless selected panel / count changed
  syncPanelValues();
  const cap = $('caption-input');
  if (cap && cap.value !== state.caption) cap.value = state.caption;
  const ts = $('title-size');
  if (ts) ts.value = String(state.titleSize);
  const tr = $('tracking');
  if (tr) tr.value = String(state.tracking);
  const sz = $('size-select');
  if (sz) {
    const key = `${state.size.w}x${state.size.h}`;
    if (sz.value !== key) sz.value = key;
  }
  const st = $('status');
  if (st) {
    st.textContent = `${state.layout} · ${state.grade} · ${state.size.w}×${state.size.h} · panel ${selectedPanel + 1}/${state.panels.length}`;
  }
  const undoBtn = $('undo-btn');
  if (undoBtn) undoBtn.disabled = past.length === 0;
  const redoBtn = $('redo-btn');
  if (redoBtn) redoBtn.disabled = future.length === 0;
}

function bindStaticControls() {
  const cap = $('caption-input');
  if (cap) cap.addEventListener('input', () => setCaption(cap.value));
  const ts = $('title-size');
  if (ts) ts.addEventListener('input', () => setTitleSize(Number(ts.value)));
  const tr = $('tracking');
  if (tr) tr.addEventListener('input', () => setTracking(Number(tr.value)));

  const sz = $('size-select');
  if (sz) {
    sz.innerHTML = '';
    SIZES.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = `${s.w}x${s.h}`;
      o.textContent = `${s.w} × ${s.h}`;
      o.dataset.index = String(i);
      sz.appendChild(o);
    });
    sz.addEventListener('change', () => {
      const opt = sz.options[sz.selectedIndex];
      setSizeByIndex(Number(opt ? opt.dataset.index : 0));
    });
  }

  const photoInput = $('photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      assignPhotoFiles(photoInput.files, selectedPanel);
      photoInput.value = '';
    });
  }

  const sh = $('shuffle-btn');
  if (sh) sh.addEventListener('click', shuffle);
  const un = $('undo-btn');
  if (un) un.addEventListener('click', undo);
  const re = $('redo-btn');
  if (re) re.addEventListener('click', redo);
  const ex = $('export-btn');
  if (ex) {
    ex.addEventListener('click', async () => {
      const blob = await exportCover(state, state.size, 'png', 0.95);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slugify(state.caption) || 'cover'}-${state.size.w}x${state.size.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }
  const exAll = $('export-all-btn');
  if (exAll) exAll.addEventListener('click', () => exportAll(state));
}

// ---------------------------------------------------------------------------
// Pointer (pan + click-select) and drag-drop on the canvas
// ---------------------------------------------------------------------------

function canvasPoint(ev) {
  const canvas = $('stage');
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
    y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function panelAt(x, y) {
  const rects = layoutPanels(state.layout, state.size.w, state.size.h);
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return 0;
}

function bindPointer() {
  const canvas = $('stage');
  if (!canvas) return;
  let drag = null;

  canvas.addEventListener('pointerdown', (ev) => {
    const pt = canvasPoint(ev);
    const idx = panelAt(pt.x, pt.y);
    drag = { x: ev.clientX, y: ev.clientY, idx, moved: false, panX0: 0, panY0: 0 };
    const p = state.panels[idx];
    if (p) {
      drag.panX0 = p.panX;
      drag.panY0 = p.panY;
    }
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {
      // Pointer capture unavailable — dragging still works via window events.
    }
    ev.preventDefault();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const p = state.panels[drag.idx];
    if (!p) return;
    const nx = clamp(drag.panX0 + dx / rect.width, -0.5, 0.5);
    const ny = clamp(drag.panY0 + dy / rect.height, -0.5, 0.5);
    // Continuous: coalesced into one undo step per drag.
    beginChange('continuous');
    p.panX = nx;
    p.panY = ny;
    lastBegin = { kind: 'continuous', time: Date.now() };
    normalizeState(state);
    render();
    syncUI();
  });

  const endDrag = (ev) => {
    if (!drag) return;
    if (!drag.moved) {
      selectPanel(drag.idx);
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    drag = null;
  });

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
    const p = state.panels[selectedPanel];
    if (!p) return;
    setZoom(clamp(p.zoom * factor, 0.5, 3));
  }, { passive: false });

  canvas.addEventListener('dragover', (ev) => ev.preventDefault());
  canvas.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const pt = canvasPoint(ev);
    const idx = panelAt(pt.x, pt.y);
    assignPhotoFiles(ev.dataTransfer ? ev.dataTransfer.files : [], idx);
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts (ignored while typing in a field)
// ---------------------------------------------------------------------------

function bindKeys() {
  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ev.ctrlKey || ev.metaKey) {
      if (ev.key === 'z' || ev.key === 'Z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      } else if (ev.key === 'y' || ev.key === 'Y') {
        ev.preventDefault();
        redo();
      }
      return;
    }
    if (ev.key >= '1' && ev.key <= '7') {
      const i = Number(ev.key) - 1;
      if (LAYOUTS[i]) setLayout(LAYOUTS[i]);
    } else if (ev.key === 'g' || ev.key === 'G') {
      const i = (GRADES.indexOf(state.grade) + 1) % GRADES.length;
      setGrade(GRADES[i]);
    } else if (ev.key === 'e' || ev.key === 'E') {
      const btn = $('export-btn');
      if (btn) btn.click();
    }
  });
}

// ---------------------------------------------------------------------------
// ?shot= scenes + boot
// ---------------------------------------------------------------------------

function applyShot() {
  let shot = null;
  try {
    shot = new URLSearchParams(window.location.search).get('shot');
  } catch (err) {
    shot = null;
  }
  const preset = shot && SHOTS[shot] ? SHOTS[shot] : null;
  if (!preset) return;
  state.layout = preset.layout;
  state.grade = preset.grade;
  state.caption = preset.caption;
  selectedPanel = 0;
  normalizeState(state);
}

// window.__vc hook (used by tests, screenshots and the dossier builder).
function installHook() {
  window.__vc = {
    version: VERSION,
    state,
    setLayout,
    setGrade,
    setCaption,
    setTitleSize,
    setTracking,
    setFilter,
    setFit,
    setZoom,
    setPan,
    selectPanel,
    shuffle,
    undo,
    redo,
    setSize,
    render,
    applyState,
    exportCover: (size, format, quality) =>
      exportCover(state, size || state.size, format || 'png', quality == null ? 0.95 : quality),
    exportAll: () => exportAll(state),
    getState: () => state,
  };
}

function init() {
  applyShot();
  normalizeState(state);
  bindStaticControls();
  buildLayoutButtons();
  buildGradeButtons();
  buildPanelControls();
  bindPointer();
  bindKeys();
  installHook();
  render();
  syncUI();
  loadSamplePhotos();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
