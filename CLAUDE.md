# CLAUDE.md — PDF Tools (public website)

A static, public website of PDF tools, hosted on GitHub Pages from `main` (repo `jrobles-27/PDF-tools`). Plain HTML, CSS and
JavaScript: no framework, no bundler, no build step. **`README.md` is the authoritative doc.** This file holds the working rules.

Related project: the desktop app `D:\MyFavTool` (its PDF Manager shares ideas and the same libraries, but this site is
separate code). Design follows the `dashboard-ui` skill (Zenith theme); keep to its contract (tokens, `UI.card`, grids).

## Hard constraints (do not break these)

1. **The site must never collect, store, or send anything about the user's files or the user.** This is the point of the
   project, and the repo is public. Concretely:
   - No `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, forms, iframes, service workers, WebRTC.
   - No `localStorage`, `sessionStorage`, IndexedDB, Cache API, cookies. **Not even for the theme.**
   - No analytics, ads, tracking pixels, third-party scripts, fonts or CDNs. Libraries live in `vendor/`.
   - No logging of file names, sizes, page counts, or typed text.
   - Keep the Content-Security-Policy in `index.html` strict: `default-src 'none'`, `connect-src 'self'` (pdf.js needs it to read
     its own bundled fonts and worker; never widen it), `form-action 'none'`, `base-uri 'none'`, `object-src 'none'`,
     scripts only `'self'` (+ `'wasm-unsafe-eval'` for pdf.js). **Never add `unsafe-eval` or any host.**
   - `tests/privacy.test.js` enforces this. **Never weaken or delete a check to make a change pass**; fix the change.
2. **Never commit anyone's documents.** `.gitignore` blocks `*.pdf`, images and ZIPs because GitHub Pages publishes whatever
   is committed. Keep test files outside the repo (use `TESTDATA=<folder> node tests/serve.js`).
3. **Pages are copied, never re-rendered or re-compressed**, and the source bytes are never modified. Operations return new
   bytes. Output carries no producer, creator or dates unless the user sets them.
4. **Be honest in the UI about hiding vs deleting.** Crop, white-out and watermark do not remove content. Don't add a
   "redact" feature that only draws black boxes.
5. **Don't push or publish on the user's behalf.** Pushing to GitHub makes the site public. Commit/push only when asked.

## Layout

- `js/core/` — pure logic (no DOM; also runs under Node for tests). `pdfops.js` is every PDF operation: bytes in, bytes out.
  All geometry uses the page **as displayed** (top-left origin, points) and converts to stored coordinates in
  `viewToUser`, so rotated and cropped pages work. Keep new logic here, with a test.
- `js/engine.js` (pdf.js drawing, thumbnails, file picking, download), `js/app-core.js` (state, open document, toasts, drag-drop,
  event delegation), `js/pages/*.js` (one thin file per tool), `js/main.js` (boot), `js/ui.js` (dashboard kit; we added
  `UI.onRender`).
- `css/theme.css` is the skill's theme, unchanged. `css/app.css` adds our styles using only theme tokens (plus `--paper` for
  the white a PDF page is drawn on).

## Adding a tool

Create `js/pages/<id>.js` calling `App.register({ id, label, icon, group, order, tone, sub, blurb, state, render, mount, onFiles })`,
add a `<script>` tag in `index.html` (before `js/main.js`), and put any logic in `js/core/` with tests. Pages return HTML
strings from `render()`; `mount(root)` wires the DOM it produced. Use `data-act="page.action"` plus `App.acts['page.action']`
for buttons, `data-set`/`data-bind`/`data-model` for state, and `App.work(text, fn)` for anything slow. After a change call
`UI.refresh()`, or update the DOM directly where re-rendering would lose focus or drawing (text boxes, the annotate stage).

## Testing

```
node tests/run.js                              # core logic + privacy checks; no dependencies
TESTDATA=<folder> node tests/serve.js 8090     # try the site; test files are served only at /__testdata/
```

No browser test runner: verify UI changes by running the site (the built-in browser works; use real mouse actions for
drag interactions, since synthetic pointer events cannot capture the pointer). Check both light and dark themes. For network
checks use the browser's network log: it must show only `GET`s to this origin and `blob:` URLs.

## Gotchas

- **pdf-lib's minified build mangles class names**: use `instanceof PDFLib.PDFTextField` etc., never `constructor.name`.
- pdf-lib compresses page content streams: to test drawn text, inflate the stream (see `contentOf` in `tests/core.test.js`).
- pdf.js: `page.cleanup()` on a shared page cancels other renders of it; don't call it. The document has no `.destroy()`; use
  `doc.loadingTask.destroy()` (`Engine.closePdf`).
- Elements re-created by `UI.refresh()` lose focus and canvas contents: cache drawn pages as blob URLs and revoke them when
  the document changes (see `Doc` in `app-core.js`).
- A listener on an input runs before the delegated `data-model` handler, so it sees the *previous* value: read the element.
- When writing files from PowerShell, avoid `Set-Content -Encoding utf8` (adds a BOM); and single-pair arrays flatten, so
  never loop over `@(@('a','b'))`. Prefer the Edit/Write tools.

## When changing something

1. Run `node tests/run.js`. 2. Update `README.md` if behaviour or limits changed. 3. If you touched a vendored library,
update `vendor/THIRD-PARTY.md`.
