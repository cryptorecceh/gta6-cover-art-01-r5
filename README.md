# Vice City Cover Studio

![layout](https://img.shields.io/badge/layouts-7-blue)
![grades](https://img.shields.io/badge/grades-5-pink)
![export](https://img.shields.io/badge/export-4%20sizes%20%C3%97%20PNG%2FJPEG-green)

A GTA-style cover maker for the **gta6-cover-art-01** bounty: turn your photos into a
Vice City poster. Pick a layout, grade it like a sunset, write the title, and export
print-ready art in seconds.

## What it does

- **7 layouts** — Solo, Duo, Trio, Quad, Strip, Banner, Frame (polaroid inset).
- **5 grades** — Sunset, Neon, Pastel, Midnight, Ocean Drive.
- **Per-panel control** — filter (None / Grayscale / Sepia / High contrast), Fit / Fill,
  pan and zoom by dragging, click to select a panel.
- **Caption** — big poster title, size 0.70–1.30×, letter spacing −2–12 px.
- **Undo / redo** (50 steps), shuffle, keyboard shortcuts (`1`–`7`, `G`, `E`, `Ctrl+Z/Y`).
- **Export** — 1080×1080, 1080×1350, 1920×1080, 1080×1920, PNG or JPEG (q 0.8/0.9/0.95);
  *Export all* downloads every size at once.
- **Deterministic** — seeded placeholder art (retro sun, skyline, palm) and grain, so the
  same state always renders the same cover. No network, no tracking.

## Try it

```sh
node serve.ts          # app/ on http://localhost:8080
```

Or build the dossier the judge reads:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node main.ts --validate-only   # check screenshots + caps without building
```

## Screenshots

| Cover (Trio) | Editor | Frame | Banner |
| --- | --- | --- | --- |
| `screenshots/1-trio.jpg` | `screenshots/2-editor.jpg` | `screenshots/3-frame.jpg` | `screenshots/4-banner.jpg` |

Two sample photos (`app/samples/boulevard.jpg`, `app/samples/pier.jpg`) ship with the
entry and load automatically, so the cover is never empty.

## Files

- `app/index.html`, `app/style.css` — the editor.
- `app/src/cover.js` — deterministic cover engine (layouts, grades, placeholder art).
- `app/src/main.js` — editor state, undo/redo, pointer + keyboard, `window.__vc` hook.
- `app/src/export.js` — PNG/JPEG export in all sizes.
- `main.ts` — Node 22 builder: copies `app/` + `screenshots/`, writes `dossier.json`.
- `serve.ts` — local static server. `shots.json` — the 4 screenshot scenes.

License: MIT (see `LICENSE`). No Rockstar artwork, logos, or fonts are used.
