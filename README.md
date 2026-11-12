# PDF Tools

Free PDF tools that run **entirely in your browser**. Organize, combine, split, annotate, sign, crop, number, watermark,
fill forms, convert to and from pictures, and pull out text. **Your files are never uploaded, stored or tracked.**

Open `index.html` through any web server (or GitHub Pages) and it works. There is no account, no install and no build step.
It opens in light or dark to match your computer's setting, and follows it if you change it while the page is open
(the sun/moon button overrides that for the current visit only).

## Privacy, and how it is enforced

Your PDFs and pictures are read by your own browser, worked on in its memory, and handed back as downloads. Closing or
refreshing the tab erases everything. This is enforced in the code, not just promised:

- **A strict Content-Security-Policy** (the first thing in `index.html`) lets the page load scripts, styles and files only
  from its own site, and send requests only to its own host (`connect-src 'self'`; pdf.js needs that to read its bundled
  fonts). There is no way for it to send anything to another server.
- **No cookies, no `localStorage`, `sessionStorage`, IndexedDB, Cache API or service workers.** Even the light/dark choice
  is not remembered.
- **No analytics, ads, tracking pixels, third-party scripts or web fonts.** Both libraries are bundled in `vendor/`.
- **No record of file names, sizes, page counts or anything typed.**
- **Tests fail the build** if any of that changes: `tests/privacy.test.js` scans the code for storage, networking and
  tracking APIs, for any address outside this site, and checks the Content-Security-Policy.

You can check it yourself: open your browser's developer tools (`F12`), look at the **Network** tab while you use a tool,
and you will see only requests for this site's own files (and in-memory `blob:` pictures), never anything being sent out.

Small print: when hosted on GitHub Pages, GitHub's servers see that your browser asked for the page, as with any website.
That is about visiting the page, not about your files. Downloaded files land in your normal Downloads folder.

## What it does

| Tool | What it does |
|---|---|
| **Open a PDF** | Open a file (or try a sample) once, then use any tool on it. Results can be downloaded or kept to edit further. |
| **Organize pages** | Pick pages by range (`1-4, 8-9`, `5-`, `last`, `4-1`) or by clicking; reorder by dragging; rotate, delete, duplicate, add blank pages; undo; save everything, only the selection, or split into one file per page, per N pages, or per range (as a ZIP). |
| **Combine PDFs** | Join PDFs in any order, optionally taking only some pages of each. |
| **Annotate and sign** | Add text, highlights, boxes, white-out, pictures, and a signature you draw, anywhere on any page (rotated pages too). |
| **Numbers and watermark** | Page numbers in several styles and positions, and a faded text watermark, with a preview. |
| **Crop pages** | Trim margins on all or chosen pages, with a live preview. |
| **Fill forms** | Fill text fields, checkboxes, drop-downs and choices in fillable PDF forms, optionally making answers permanent. |
| **Properties** | Edit title, author, dates and more, or strip all metadata before sharing. |
| **PDF to images** | PNG (lossless), JPEG or WebP at 72 to 600 dpi, as a ZIP. |
| **Images to PDF** | One picture per page; JPEG and PNG are placed exactly as they are, sideways phone photos are turned upright. |
| **Extract text** | All the text in a PDF, page by page, as a `.txt` file. |

Pages are copied, never re-rendered or re-compressed, so trimming, combining and splitting lose no quality.

## Honest limits

- **Hiding is not deleting.** Crop, white-out boxes and watermarks cover content but leave it in the file. To remove
  sensitive material for good, delete the page or convert it to a picture.
- Page copying (organize, combine, split) does not carry over **bookmarks or form-field data**.
- **Password-protected PDFs** must be unlocked first. There is **no OCR**: scanned pages have no text to extract.
- Added text uses a standard font, so Western European letters work but other scripts do not.
- Everything is held in memory, so very large PDFs can be slow or fail on small computers.
- Needs a current browser (Chrome or Edge 111+, Firefox 113+, Safari 16.4+). Built for desktop screens.

## Run it

```
node tests/serve.js          # then open http://127.0.0.1:8080/
node tests/run.js            # run the tests (no dependencies)
```

Any static file server works. To publish with GitHub Pages: repository **Settings, Pages, Deploy from a branch,
`main` / root**. Relative paths are used throughout, so it works under `https://<user>.github.io/<repo>/`.

## How it is built

Plain HTML, CSS and JavaScript. No framework, no bundler, no build step.

```
index.html            page shell and the Content-Security-Policy
css/theme.css         dashboard theme (light and dark tokens)
css/app.css           styles for the tools
js/core/              pure logic, no DOM, runs in the browser and in Node tests
  pdfops.js           every PDF operation (bytes in, bytes out)
  ranges.js           page-range parser   zip.js  ZIP writer   exif.js  photo orientation
js/engine.js          pdf.js drawing, thumbnails, file picking, downloads
js/app-core.js        shared state, the open document, toasts, drag-and-drop
js/pages/*.js         one file per tool, each a thin layer over the core
vendor/               pdf-lib and pdf.js, bundled (see vendor/THIRD-PARTY.md)
tests/                node tests/run.js: core logic, and the privacy checks
```

The logic lives in `js/core/` so it can be tested without a browser; the screen and the saved file cannot disagree
because they call the same functions.

## Credits

[pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) edits the PDFs and [pdf.js](https://github.com/mozilla/pdf.js)
(Apache-2.0) draws them. Licenses are in `vendor/`.
