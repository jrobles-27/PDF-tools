# Third-party code

Both libraries are bundled so the site never loads code from anywhere else. Pinned versions:

| Library | Version | License | Used for |
|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT (`pdf-lib.LICENSE.md`) | creating and editing PDFs |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.4.299 | Apache-2.0 (`pdfjs/LICENSE`) | drawing pages and reading text |

`vendor/pdfjs/` holds only what pdf.js needs at run time: `pdf.min.mjs`, `pdf.worker.min.mjs` and the `cmaps`,
`standard_fonts`, `wasm` and `iccs` folders. Each carries its own license files (Foxit and Liberation fonts, Adobe CMaps,
OpenJPEG, JBIG2, QCMS, ICC profiles).

## Upgrading

Copy `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` and the four folders from a new `pdfjs-dist` package, or
`dist/pdf-lib.min.js` from a new `pdf-lib`. Do not edit these files by hand. Run `node tests/run.js` afterwards, and
update the versions above.
