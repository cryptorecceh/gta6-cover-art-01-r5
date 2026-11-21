// Vice City Cover Studio — program entry (Node 22, standard library only).
// Copies app/ and screenshots/ beside this file to /output (or MAKEFUN_OUTPUT_DIR
// outside the grader container) and writes /output/dossier.json with the vendored
// make.fun library. Also validates the entry against the competition caps:
//   screenshots: at most 4, each at most 256 KiB, long side at most 1280 px,
//   short side at least 480 px; dossier at most 1.5 MiB; app text at most 160 KiB.
//
// Usage:
//   node main.ts                  build /output (or $MAKEFUN_OUTPUT_DIR)
//   node main.ts --validate-only  check app/ + screenshots/ without building
//   node main.ts --sizes          list the export sizes the app offers
//   node main.ts --formats        list the export formats the app offers
//   node main.ts --help           show this usage

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';
import { FORMATS, QUALITIES, SIZES } from './app/src/cover.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps from the competition (reference/gate.json via the starter): text_max_bytes
// shapes the dossier bytes; the rest refuse an entry the scorer would refuse.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};
const DOSSIER_MAX_BYTES = 1572864; // 1.5 MiB
const SHOT_LONG_MAX = 1280;
const SHOT_SHORT_MIN = 480;

const args = process.argv.slice(2);

function usage(): void {
  console.log(`Vice City Cover Studio — main.ts
Usage:
  node main.ts                  build to /output (or $MAKEFUN_OUTPUT_DIR)
  node main.ts --validate-only  check app/ + screenshots/ without building
  node main.ts --sizes          list export sizes
  node main.ts --formats        list export formats
  node main.ts --help           show this usage`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

// Minimal PNG/JPEG dimension readers (stdlib only, no image libraries).
function pngDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) { pos += 1; continue; }
    const marker = buf[pos + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { pos += 2; continue; }
    const len = buf.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > buf.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const h = buf.readUInt16BE(pos + 5);
      const w = buf.readUInt16BE(pos + 7);
      return { w, h };
    }
    pos += 2 + len;
  }
  return null;
}

function imageDimensions(file: string): { w: number; h: number } | null {
  const buf = readFileSync(file);
  const ext = file.toLowerCase();
  if (ext.endsWith('.png')) return pngDimensions(buf);
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return jpegDimensions(buf);
  return null;
}

function validateScreenshots(dir: string): string[] {
  const errors: string[] = [];
  if (!existsSync(dir)) {
    errors.push(`screenshots/ is missing (expected 3-4 screenshots)`);
    return errors;
  }
  const files = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();
  if (files.length === 0) errors.push('screenshots/ has no PNG/JPEG files (expected 3-4)');
  if (files.length > CAPS.screenshots.max) {
    errors.push(`too many screenshots: ${files.length} (max ${CAPS.screenshots.max})`);
  }
  for (const f of files) {
    const file = join(dir, f);
    const size = statSync(file).size;
    if (size > CAPS.screenshots.max_bytes) {
      errors.push(`${f}: ${size} bytes exceeds ${CAPS.screenshots.max_bytes} bytes`);
    }
    const dims = imageDimensions(file);
    if (!dims) { errors.push(`${f}: could not read PNG/JPEG dimensions`); continue; }
    const longSide = Math.max(dims.w, dims.h);
    const shortSide = Math.min(dims.w, dims.h);
    if (longSide > SHOT_LONG_MAX) errors.push(`${f}: long side ${longSide}px exceeds ${SHOT_LONG_MAX}px`);
    if (shortSide < SHOT_SHORT_MIN) errors.push(`${f}: short side ${shortSide}px below ${SHOT_SHORT_MIN}px`);
  }
  return errors;
}

function validateAppText(appDir: string): string[] {
  const errors: string[] = [];
  let textBytes = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(html|js|mjs|css|json|txt|md)$/i.test(entry.name)) textBytes += statSync(p).size;
    }
  };
  if (!existsSync(appDir)) { errors.push('app/ is missing'); return errors; }
  walk(appDir);
  if (textBytes > CAPS.text_max_bytes) {
    errors.push(`app text ${textBytes} bytes exceeds ${CAPS.text_max_bytes} bytes`);
  }
  return errors;
}

function report(errors: string[]): void {
  if (errors.length === 0) {
    console.log('validate: OK');
    return;
  }
  for (const e of errors) console.error(`validate: ${e}`);
  fail(`${errors.length} validation error(s)`);
}

if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

if (args.includes('--sizes')) {
  console.log(SIZES.map((s: { w: number; h: number }) => `${s.w}x${s.h}`).join('\n'));
  process.exit(0);
}

if (args.includes('--formats')) {
  console.log([...FORMATS, ...QUALITIES.map((q: number) => `jpeg q${q}`)].join('\n'));
  process.exit(0);
}

const unknown = args.filter((a) => a !== '--validate-only');
if (unknown.length > 0) fail(`unknown flag: ${unknown.join(' ')} (see --help)`);

if (args.includes('--validate-only')) {
  const errors = [
    ...validateScreenshots(join(here, 'screenshots')),
    ...validateAppText(join(here, 'app')),
  ];
  report(errors);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossierPath = join(out, 'dossier.json');
writeFileSync(dossierPath, buildDossier(out, CAPS));

const outErrors = [
  ...validateScreenshots(join(out, 'screenshots')),
  ...validateAppText(join(out, 'app')),
];
const dossierBytes = statSync(dossierPath).size;
if (dossierBytes > DOSSIER_MAX_BYTES) {
  outErrors.push(`dossier.json ${dossierBytes} bytes exceeds ${DOSSIER_MAX_BYTES} bytes`);
}
report(outErrors);
console.log(`built ${out} (app ${SIZES.length} sizes, dossier ${dossierBytes} bytes)`);
