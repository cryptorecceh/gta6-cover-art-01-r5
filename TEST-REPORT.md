# TEST-REPORT — Vice City Cover Studio (R5)

Entry: `gta6-cover-art-01`, repo `cryptorecceh/gta6-cover-art-01-r5`.
Driver: `~/workspace/tools/makefun/scratch-r5/test-drive.mjs` (scratch tool, NOT part of the entry).
Results JSON: `~/workspace/tools/makefun/scratch-r5/test-results.json`.
Method: headless Chrome (CDP) + `serve.ts` on localhost, driving the app through
`window.__vc` + DOM; `node main.ts --validate-only` for the dossier gate.
Screenshots were written to files only — never opened as images in this session
(visual check done separately by the parent).

## Verdict: 75 / 75 PASSED

Final run: 2026-11-21 ~12:42 WIB, driver exit 0.

| Group | Tests | Passed |
|---|---|---|
| Boot / DOM / defaults | 10 | 10 |
| Layouts (7) + Frame tilt | 8 | 8 |
| Grades (5) | 5 | 5 |
| Filters (4) | 4 | 4 |
| Caption (set, clamps, empty, long) | 7 | 7 |
| Pan / zoom / Fit-Fill (incl. clamps) | 5 | 5 |
| Undo / redo (basic, cap 50, coalesce, discrete, redo-clear, size-excluded) | 6 | 6 |
| Shortcuts (1–7, G, Ctrl+Z/Y, typing-ignored, E) | 6 | 6 |
| Shuffle | 1 | 1 |
| ?shot= scenes (trio, editor, frame, banner, unknown) | 5 | 5 |
| Export (PNG/JPEG × 4 sizes, quality order, slugify, renderToCanvas, exportAll) | 11 | 11 |
| Determinism (render, placeholder seeds, ?shot= twice) | 3 | 3 |
| Placeholder (no photos) | 1 | 1 |
| Serve + validate-only | 2 | 2 |
| No page errors (uncaught exceptions / console errors) | 1 | 1 |
| **Total** | **75** | **75** |

## Evidence highlights

- Layouts: Solo 1, Duo 2, Trio 3, Quad 4, Strip 3, Banner 4, Frame 2 panels;
  Frame inset tilt −4 confirmed. Every layout renders non-blank.
- Undo history capped at exactly 50 steps (60 changes → 50 undos changed state).
- Coalescing: rapid titleSize changes within 600 ms = 1 undo step (verified with a
  700 ms-separated baseline); layout+grade stay 2 separate steps.
- Export: all 4 sizes × PNG/JPEG produce valid blobs; JPEG q0.95 (331,791 B) >
  q0.8 (163,616 B); `exportAll` resolves and downloads exactly 8 files.
- Determinism: same state rendered twice → byte-identical canvas; placeholder art
  identical for same seed, different for different seed; `?shot=trio` twice →
  identical canvas.
- `node main.ts --validate-only` exits 0. Dossier sha256 (final): see commit message
  / submission record.

## Bugs found and fixed in this session

1. **B-1 (app, real): missing favicon → `/favicon.ico` 404 → console error.**
   First driver run: 72/75, `no-page-errors` FAIL ("Failed to load resource: 404").
   Root cause confirmed: no favicon in `app/`, Chrome requests `/favicon.ico`.
   Fix: inline SVG favicon (orange sun) via `<link rel="icon">` in `app/index.html`.
   After fix: 0 console errors.
2. **B-2 (driver test, not an app bug): `undo-coalesce` baseline.**
   First run FAIL: after 1 undo titleSize=1 (expected 0.8). Cause: all four
   `setTitleSize` calls happened inside the 600 ms coalesce window, so the app
   correctly grouped them into ONE step (reverting to the 1.0 default).
   Fix: driver now waits 700 ms after the 0.8 baseline before the rapid changes.
   App behaviour is correct per design.
3. **B-3 (driver test, not an app bug): `key-ctrl-z` baseline.**
   First run FAIL: expected Trio, got Duo. Cause: Group D had already switched the
   layout to Duo (key-layout-2 test), so undo correctly reverted Quad → Duo.
   Fix: driver reloads the page (fresh Trio) before the Ctrl+Z test.
   App behaviour is correct.

## Screenshot fix (parent visual note)

- `2-editor.jpg` was 1280×720 — viewport too short, bottom of canvas + controls cut
  off. Retaken at **1280×1000** (156.9 KiB, under the 256 KiB cap); `shots.json`
  editor entry updated to `h: 1000`. The other 3 screenshots were NOT touched
  (parent verified them good; R4 polaroid bug confirmed fixed in `3-frame.jpg`).
- Final screenshots: 1-trio 130,017 B; 2-editor 160,693 B; 3-frame 131,803 B;
  4-banner 127,531 B — all ≤ 256 KiB, long side ≤ 1280, short side ≥ 480.

## First driver run (before fixes)

34/34 passed, then the driver itself threw `SyntaxError: Identifier 'p' has already
been declared` — top-level `const` in `Runtime.evaluate` persists across evaluations
in the same page context. Fixed by wrapping page expressions in IIFEs. No app code
was involved.

## Known non-issues

- `shuffle` uses `Math.random` only to pick a preset; the rendered state itself is
  fully deterministic (verified by the determinism tests).
- `node serve.ts` prints a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning on stderr
  (no `package.json` `type` field); it does not affect serving or validation.
