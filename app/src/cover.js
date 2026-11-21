// app/src/cover.js — Vice City Cover Studio engine (R5)
// Deterministic canvas cover-art engine. No network, no Date, no unseeded random.
// State shape (from main.js):
//   { layout, grade, caption, titleSize (0.70-1.30), tracking (-2..12),
//     panels: [{ photo, filter, panX, panY, zoom, fit }] }

export const VERSION = 'r5';

export const LAYOUTS = ['Solo', 'Duo', 'Trio', 'Quad', 'Strip', 'Banner', 'Frame'];
export const GRADES = ['Sunset', 'Neon', 'Pastel', 'Midnight', 'Ocean Drive'];
export const FILTERS = ['None', 'Grayscale', 'Sepia', 'High contrast'];
export const SIZES = [
  { w: 1080, h: 1080 },
  { w: 1080, h: 1350 },
  { w: 1920, h: 1080 },
  { w: 1080, h: 1920 },
];
export const FORMATS = ['png', 'jpeg'];
export const QUALITIES = [0.8, 0.9, 0.95];

const GRADE_DEFS = {
  Sunset: {
    sky: ['#ff9a3d', '#ff5e62', '#7b2d8b'],
    sun: '#ffd166',
    caption: '#ffffff',
    accent: '#ffcf5c',
    panel: '#241640',
    scrim: 'rgba(20,8,32,0.55)',
  },
  Neon: {
    sky: ['#0f0c29', '#302b63', '#ff2e88'],
    sun: '#ff2e88',
    caption: '#ffffff',
    accent: '#00e5ff',
    panel: '#12082b',
    scrim: 'rgba(8,4,24,0.55)',
  },
  Pastel: {
    sky: ['#ffd6e0', '#c5f0ff', '#fff3b0'],
    sun: '#ffb703',
    caption: '#3d2c4d',
    accent: '#ff7b9c',
    panel: '#f2e3ff',
    scrim: 'rgba(61,44,77,0.35)',
  },
  Midnight: {
    sky: ['#050510', '#0b1026', '#1b2a4a'],
    sun: '#e8e8ff',
    caption: '#eaf2ff',
    accent: '#7aa2ff',
    panel: '#0a0f24',
    scrim: 'rgba(3,5,16,0.55)',
  },
  'Ocean Drive': {
    sky: ['#00b4a2', '#00897b', '#004d40'],
    sun: '#ff8a5c',
    caption: '#ffffff',
    accent: '#ff6b6b',
    panel: '#00332e',
    scrim: 'rgba(0,30,28,0.50)',
  },
};

function gradeDef(grade) {
  return GRADE_DEFS[grade] || GRADE_DEFS.Sunset;
}

// Seeded PRNG (mulberry32) — deterministic, fully seeded.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexA(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function filterToCss(filter) {
  switch (filter) {
    case 'Grayscale': return 'grayscale(100%)';
    case 'Sepia': return 'sepia(100%)';
    case 'High contrast': return 'contrast(165%) saturate(130%)';
    default: return 'none';
  }
}

export function layoutPanels(layout, W, H) {
  const r = (x, y, w, h, hero) => ({ x, y, w, h, hero: !!hero });
  switch (layout) {
    case 'Solo':
      return [r(0, 0, W, H, true)];
    case 'Duo':
      return [r(0, 0, W / 2, H, true), r(W / 2, 0, W / 2, H)];
    case 'Trio': {
      const hw = W * 0.58;
      const rw = W - hw;
      return [
        r(0, 0, hw, H, true),
        r(hw, 0, rw, H / 2),
        r(hw, H / 2, rw, H / 2),
      ];
    }
    case 'Quad':
      return [
        r(0, 0, W / 2, H / 2, true),
        r(W / 2, 0, W / 2, H / 2),
        r(0, H / 2, W / 2, H / 2),
        r(W / 2, H / 2, W / 2, H / 2),
      ];
    case 'Strip': {
      const w = W / 3;
      return [r(0, 0, w, H, true), r(w, 0, w, H), r(2 * w, 0, w, H)];
    }
    case 'Banner': {
      const hh = H * 0.72;
      const sh = H - hh;
      const w = W / 3;
      return [
        r(0, 0, W, hh, true),
        r(0, hh, w, sh),
        r(w, hh, w, sh),
        r(2 * w, hh, w, sh),
      ];
    }
    case 'Frame': {
      const iw = W * 0.28;
      const ih = iw * 1.25;
      const m = W * 0.04;
      const inset = { x: W - iw - m, y: H - ih - H * 0.05, w: iw, h: ih, inset: true, tilt: -4 };
      return [r(0, 0, W, H, true), inset];
    }
    default:
      return [r(0, 0, W, H, true)];
  }
}

const PLACEHOLDER_PALETTES = [
  { sky: ['#ff9a3d', '#ff5e62', '#7b2d8b'], sun: '#ffd166', city: '#241640', palm: '#1a0f33' },
  { sky: ['#00b4a2', '#00897b', '#004d40'], sun: '#ff8a5c', city: '#00332e', palm: '#012622' },
  { sky: ['#2b1055', '#7597de', '#ff2e88'], sun: '#ffe66d', city: '#12082b', palm: '#0d0520' },
];

function drawPalm(ctx, x, y, h, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.03);
  ctx.lineCap = 'round';
  // trunk (slight curve)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + h * 0.06, y - h * 0.55, x + h * 0.02, y - h);
  ctx.stroke();
  const topX = x + h * 0.02;
  const topY = y - h;
  // fronds (arch up, then droop)
  const nFronds = 6;
  for (let i = 0; i < nFronds; i++) {
    const ang = Math.PI * (0.08 + (i / (nFronds - 1)) * 0.84);
    const len = h * 0.34;
    const ex = topX + Math.cos(ang) * len;
    const ey = topY + Math.sin(ang) * len * 0.55 - h * 0.08;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(
      topX + Math.cos(ang) * len * 0.5,
      topY - h * 0.14,
      ex, ey,
    );
    ctx.stroke();
  }
}

export function drawPlaceholderArt(ctx, rect, seed) {
  const rand = mulberry32(seed * 2654435761 + 97);
  const pal = PLACEHOLDER_PALETTES[Math.floor(rand() * PLACEHOLDER_PALETTES.length)];
  // sky
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(0.55, pal.sky[1]);
  g.addColorStop(1, pal.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 18; i++) {
    const sx = rect.x + rand() * rect.w;
    const sy = rect.y + rand() * rect.h * 0.45;
    const sr = 0.6 + rand() * 1.4;
    ctx.fillRect(sx, sy, sr, sr);
  }
  // retro sun (striped)
  const sunR = Math.min(rect.w, rect.h) * 0.22;
  const sunCx = rect.x + rect.w * (0.3 + rand() * 0.4);
  const sunCy = rect.y + rect.h * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = pal.sun;
  ctx.fillRect(sunCx - sunR, sunCy - sunR, sunR * 2, sunR * 2);
  ctx.fillStyle = pal.sky[1];
  let gapY = sunCy + sunR * 0.05;
  let gapH = sunR * 0.06;
  while (gapY < sunCy + sunR) {
    ctx.fillRect(sunCx - sunR, gapY, sunR * 2, gapH);
    gapY += gapH + sunR * 0.12;
    gapH *= 1.25;
  }
  ctx.restore();
  // skyline
  const baseY = rect.y + rect.h;
  const nB = 5 + Math.floor(rand() * 4);
  let bx = rect.x;
  const bw = rect.w / nB;
  for (let i = 0; i < nB; i++) {
    const bh = rect.h * (0.14 + rand() * 0.22);
    ctx.fillStyle = pal.city;
    ctx.fillRect(bx, baseY - bh, bw * 0.92, bh);
    ctx.fillStyle = 'rgba(255,209,102,0.85)';
    const nWin = 2 + Math.floor(rand() * 3);
    for (let wI = 0; wI < nWin; wI++) {
      const wx = bx + bw * (0.15 + rand() * 0.6);
      const wy = baseY - bh + rect.h * (0.03 + rand() * 0.2);
      ctx.fillRect(wx, wy, 2.5, 3.5);
    }
    bx += bw;
  }
  // palm (one, at a seeded side)
  const palmX = rect.x + rect.w * (0.12 + rand() * 0.76);
  const palmH = rect.h * (0.2 + rand() * 0.12);
  drawPalm(ctx, palmX, baseY, palmH, pal.palm);
}

// Draw one panel's photo (filtered, pan/zoom, Fill/Fit) or placeholder art.
function drawPanel(ctx, panel, rect, seed) {
  const photo = panel.photo || null;
  if (!photo) {
    drawPlaceholderArt(ctx, rect, seed);
    return;
  }
  const pw = photo.naturalWidth || photo.width || 1;
  const ph = photo.naturalHeight || photo.height || 1;
  const zoom = panel.zoom || 1;
  let scale;
  if (panel.fit === 'Fit') {
    scale = Math.min(rect.w / pw, rect.h / ph) * zoom;
  } else {
    scale = Math.max(rect.w / pw, rect.h / ph) * zoom;
  }
  const dw = pw * scale;
  const dh = ph * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (panel.panX || 0) * rect.w;
  const dy = rect.y + (rect.h - dh) / 2 + (panel.panY || 0) * rect.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.filter = filterToCss(panel.filter);
  ctx.drawImage(photo, dx, dy, dw, dh);
  ctx.restore();
  ctx.filter = 'none';
}

function trackedChars(ctx, text, tracking) {
  const chars = Array.from(text);
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  return { chars, widths, total };
}

function drawTracked(ctx, text, cx, y, tracking, mode) {
  const { chars, widths, total } = trackedChars(ctx, text, tracking);
  let x = cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    if (mode === 'stroke') ctx.strokeText(chars[i], x, y);
    else ctx.fillText(chars[i], x, y);
    x += widths[i] + tracking;
  }
  ctx.textAlign = prevAlign;
}

function drawCaption(ctx, state, W, H, grade) {
  const caption = (state.caption || '').trim();
  if (!caption) return;
  const text = caption.toUpperCase();
  const titleSize = state.titleSize || 1;
  const tracking = state.tracking == null ? 2 : state.tracking;
  let size = Math.round(W * 0.085 * titleSize);
  const fontFor = (s) => `900 ${s}px "Arial Black", Arial, sans-serif`;
  ctx.font = fontFor(size);
  let total = trackedChars(ctx, text, tracking).total;
  const maxW = W * 0.92;
  while (total > maxW && size > 24) {
    size = Math.round(size * 0.92);
    ctx.font = fontFor(size);
    total = trackedChars(ctx, text, tracking).total;
  }
  const y = H * 0.9;
  // readability scrim band
  const scrim = ctx.createLinearGradient(0, H * 0.74, 0, H);
  scrim.addColorStop(0, 'rgba(0,0,0,0)');
  scrim.addColorStop(1, grade.scrim);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H * 0.74, W, H * 0.26);
  // outline + fill
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.strokeStyle = 'rgba(10,6,20,0.85)';
  ctx.lineJoin = 'round';
  drawTracked(ctx, text, W / 2, y, tracking, 'stroke');
  ctx.fillStyle = grade.caption;
  drawTracked(ctx, text, W / 2, y, tracking, 'fill');
  // accent bar under caption
  const barW = Math.min(total * 0.5, W * 0.4);
  ctx.fillStyle = grade.accent;
  ctx.fillRect(W / 2 - barW / 2, y + size * 0.22, barW, Math.max(3, size * 0.05));
}

function applyGrain(ctx, W, H) {
  // Deterministic grain from a fixed seed — same noise every run.
  const rand = mulberry32(20261121);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const n = Math.round((W * H) / 900);
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.globalAlpha = 0.03 + rand() * 0.05;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.restore();
}

function applyVignette(ctx, W, H) {
  const g = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.72,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function applyScanlines(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < H; y += 4) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

export function drawCover(ctx, state, W, H) {
  const grade = gradeDef(state.grade);
  const layout = state.layout || 'Solo';
  const panels = state.panels || [];
  // base
  ctx.fillStyle = grade.panel;
  ctx.fillRect(0, 0, W, H);
  const rects = layoutPanels(layout, W, H);
  const panelAt = (i) => panels[i] || { photo: null, filter: 'None', panX: 0, panY: 0, zoom: 1, fit: 'Fill' };
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const panel = panelAt(i);
    const seed = 1000 + i * 77;
    if (rect.inset) {
      // polaroid inset, tilted -4 deg
      const tilt = ((rect.tilt || -4) * Math.PI) / 180;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const border = Math.max(6, rect.w * 0.05);
      const bottomExtra = rect.h * 0.18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      // white polaroid backing (thicker bottom border)
      ctx.fillStyle = '#fdfdf8';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillRect(-rect.w / 2 - border, -rect.h / 2 - border, rect.w + border * 2, rect.h + border * 2 + bottomExtra);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      // photo inside (clip to photo area, in rotated space)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.clip();
      ctx.translate(-rect.w / 2, -rect.h / 2);
      drawPanel(ctx, panel, { x: 0, y: 0, w: rect.w, h: rect.h }, seed);
      ctx.restore();
      ctx.restore();
    } else {
      // fill rect with panel color first (letterbox base for Fit)
      ctx.fillStyle = grade.panel;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      drawPanel(ctx, panel, rect, seed);
    }
  }
  // grade tint overlay (unifies the look)
  const tint = ctx.createLinearGradient(0, 0, 0, H);
  tint.addColorStop(0, hexA(grade.sky[0], 0.10));
  tint.addColorStop(0.6, hexA(grade.sky[1], 0.06));
  tint.addColorStop(1, hexA(grade.sky[2], 0.12));
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  // caption
  drawCaption(ctx, state, W, H, grade);
  // effects
  applyGrain(ctx, W, H);
  applyVignette(ctx, W, H);
  applyScanlines(ctx, W, H);
}
