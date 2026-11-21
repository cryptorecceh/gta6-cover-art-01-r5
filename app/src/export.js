// app/src/export.js — Vice City Cover Studio export (R5)
// Pure, deterministic export helpers. Rendering is delegated to cover.js
// (drawCover). No Math.random, no Date.now, no network.

import { drawCover, SIZES, FORMATS, QUALITIES } from './cover.js';

// "SUNSET HEIST" -> "sunset-heist". Empty/blank -> "cover".
export function slugify(text) {
  const slug = String(text == null ? '' : text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'cover';
}

// Render the cover offscreen at the given size. Returns the canvas.
export function renderToCanvas(state, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawCover(ctx, state, w, h);
  return canvas;
}

function mimeFor(format) {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

function extFor(format) {
  return format === 'jpeg' ? 'jpg' : 'png';
}

// Render + encode. Resolves to a Blob (PNG always; JPEG uses quality).
// size: {w, h}; format: 'png' | 'jpeg'; quality: 0..1 (JPEG only).
export function exportCover(state, size, format, quality) {
  const fmt = format === 'jpeg' ? 'jpeg' : 'png';
  const q = typeof quality === 'number' && Number.isFinite(quality)
    ? Math.min(1, Math.max(0.1, quality))
    : 0.95;
  const w = Math.round((size && size.w) || 1080);
  const h = Math.round((size && size.h) || 1080);
  const canvas = renderToCanvas(state, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('toBlob returned null'));
      },
      mimeFor(fmt),
      fmt === 'jpeg' ? q : undefined,
    );
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Download one file for the given size/format/quality.
export async function exportCoverFile(state, size, format, quality) {
  const blob = await exportCover(state, size, format, quality);
  const slug = slugify(state.caption);
  const name = `${slug}-${size.w}x${size.h}.${extFor(format === 'jpeg' ? 'jpeg' : 'png')}`;
  downloadBlob(blob, name);
  return name;
}

// Download every combination: each SIZES entry as PNG + JPEG (q 0.9).
// Small delay between downloads so the browser does not block them.
export async function exportAll(state) {
  const slug = slugify(state.caption);
  const names = [];
  for (const size of SIZES) {
    for (const format of FORMATS) {
      const quality = format === 'jpeg' ? 0.9 : 0.95;
      const blob = await exportCover(state, size, format, quality);
      const name = `${slug}-${size.w}x${size.h}.${extFor(format)}`;
      downloadBlob(blob, name);
      names.push(name);
      await sleep(150);
    }
  }
  return names;
}

export { SIZES, FORMATS, QUALITIES };
