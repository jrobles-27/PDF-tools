# Third-party code

All libraries are bundled so the site never loads code from anywhere else. Pinned versions:

| Library | Version | License | Used for |
|---|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT (`pdf-lib.LICENSE.md`) | creating and editing PDFs |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.4.299 | Apache-2.0 (`pdfjs/LICENSE`) | drawing pages and reading text |
| [qpdf](https://github.com/qpdf/qpdf) compiled to WebAssembly, via [`@neslinesli93/qpdf-wasm`](https://www.npmjs.com/package/@neslinesli93/qpdf-wasm) | qpdf 12.2.0, package 0.3.1 | qpdf: Apache-2.0 (`qpdf/qpdf.COPYRIGHT.txt`); wrapper: ISC (`qpdf/qpdf-wasm.LICENSE.txt`) | adding and removing passwords, lossless size tidy-up |

`vendor/qpdf/` holds `qpdf.js` (the loader) and `qpdf.wasm`. They are loaded only when a password or compression tool is
first used. SHA-256 of `qpdf.wasm`: `69A17EECB26EF73E6B853487500802B18523C7B453382DE0063BB2D387EDB6BD`; of `qpdf.js`:
`C0E8FE62E0C3385DD8CB5D6B613F74D87A4138A3A3343E2ADD45A067A14D0884`. npm integrity of the package tarball:
`sha512-pN6wK7JSq66dtmFpncxPAvuOrILm+sdrm1SI8ZKMCl3TSKKHQeCXoes4p8gXNez8dpEhZ0st+qeN4tLbeCm3kw==`.

`vendor/pdfjs/` holds only what pdf.js needs at run time: `pdf.min.mjs`, `pdf.worker.min.mjs` and the `cmaps`,
`standard_fonts`, `wasm` and `iccs` folders. Each carries its own license files (Foxit and Liberation fonts, Adobe CMaps,
OpenJPEG, JBIG2, QCMS, ICC profiles).

## Upgrading

Copy `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` and the four folders from a new `pdfjs-dist` package, or
`dist/pdf-lib.min.js` from a new `pdf-lib`, or `dist/qpdf.js` and `dist/qpdf.wasm` from a new `@neslinesli93/qpdf-wasm`
(then refresh the hashes above and `qpdf/qpdf.COPYRIGHT.txt`, which is the output of `qpdf --copyright`). Do not edit these files by hand. Run `node tests/run.js` afterwards, and
update the versions above.
