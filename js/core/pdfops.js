/* PDF operations on bytes, using pdf-lib. Pure: no DOM, no network, no storage. Runs in the browser and under Node.
 * Every function takes Uint8Array bytes and returns new Uint8Array bytes. The input is never modified.
 *
 * Page copying keeps page content exactly (nothing is re-rendered or re-compressed). Known limits:
 * bookmarks and document-level form data are not carried over when pages are copied. */
(function (root) {
  'use strict';

  const node = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const PDFLib = node ? require('../../vendor/pdf-lib.min.js') : root.PDFLib;
  const Exif = node ? require('./exif.js') : root.Exif;
  const { PDFDocument, StandardFonts, rgb, degrees, PDFName } = PDFLib;

  class UserError extends Error {}

  const norm = a => ((a % 360) + 360) % 360;
  const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0;
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function openDoc(bytes) {
    try {
      return await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (err) {
      if (/encrypt/i.test(String(err && err.message))) {
        throw new UserError('This PDF is password-protected. Remove its password first (for example by opening it and printing to a new PDF), then try again.');
      }
      throw new UserError('This PDF could not be read. It may be damaged.');
    }
  }

  // No producer, creator or dates are added, so results carry no trace of this tool.
  async function newDoc() { return PDFDocument.create({ updateMetadata: false }); }

  async function save(doc) { return doc.save({ useObjectStreams: true }); }

  function copyInfo(src, out) {
    const t = src.getTitle(), a = src.getAuthor(), s = src.getSubject(), k = src.getKeywords();
    if (t) out.setTitle(t);
    if (a) out.setAuthor(a);
    if (s) out.setSubject(s);
    if (k) out.setKeywords([k]);
  }

  // ---------- page geometry (how a page is displayed vs how it is stored) ----------

  function geometry(page) {
    const box = page.getCropBox();
    const r = norm(page.getRotation().angle);
    const sideways = r === 90 || r === 270;
    return { cx: box.x, cy: box.y, cw: box.width, ch: box.height, r: r, W: sideways ? box.height : box.width, H: sideways ? box.width : box.height };
  }

  /** Map a point in the displayed page (points, origin top-left, y down) to stored page coordinates. */
  function viewToUser(g, vx, vy) {
    switch (g.r) {
      case 90: return { x: g.cx + vy, y: g.cy + vx };
      case 180: return { x: g.cx + (g.cw - vx), y: g.cy + vy };
      case 270: return { x: g.cx + (g.cw - vy), y: g.cy + (g.ch - vx) };
      default: return { x: g.cx + vx, y: g.cy + (g.ch - vy) };
    }
  }

  function ensureEncodable(font, text) {
    try { font.encodeText(text); } catch (e) {
      throw new UserError('That text has characters the built-in font cannot draw. Use letters, numbers and common punctuation (Western European accents are fine).');
    }
  }

  /** Draw upright text with its baseline-left corner at (x, y) in the displayed page. */
  function drawTextView(page, font, text, o) {
    const g = geometry(page);
    const p = viewToUser(g, o.x, o.y);
    page.drawText(text, { x: p.x, y: p.y, size: o.size, font: font, color: o.color || rgb(0, 0, 0), opacity: o.opacity == null ? 1 : o.opacity, rotate: degrees(g.r + (o.angle || 0)) });
  }

  // ---------- organize: reorder, delete, rotate, duplicate, blank pages ----------

  /** plan: [{ src: 0-based page index | null (blank), rot: degrees to add, size?: [w,h] for blanks }] */
  async function buildFromPlan(srcBytes, plan) {
    return planToBytes(await openDoc(srcBytes), plan);
  }

  /** Several plans from one source, reading the source only once. Returns an array of byte arrays. */
  async function buildMany(srcBytes, plans, onProgress) {
    const src = await openDoc(srcBytes);
    const out = [];
    for (let i = 0; i < plans.length; i++) {
      out.push(await planToBytes(src, plans[i]));
      if (onProgress) onProgress(i + 1, plans.length);
    }
    return out;
  }

  async function planToBytes(src, plan) {
    if (!plan.length) throw new UserError('There are no pages to save.');
    const total = src.getPageCount();
    const real = plan.filter(p => p.src != null);
    if (real.some(p => !Number.isInteger(p.src) || p.src < 0 || p.src >= total)) throw new UserError('Those pages are not in this PDF.');
    const out = await newDoc();
    copyInfo(src, out);
    const copies = real.length ? await out.copyPages(src, real.map(p => p.src)) : [];
    const first = src.getPage(0).getSize();
    let ci = 0;
    for (const p of plan) {
      if (p.src == null) {
        // A blank page copies the size and turn of the page it was added after (p.ref), else the first page.
        const ref = p.ref != null && p.ref >= 0 && p.ref < total ? src.getPage(p.ref) : null;
        const size = p.size || (ref ? [ref.getSize().width, ref.getSize().height] : [first.width, first.height]);
        const page = out.addPage(size);
        const turn = norm((ref ? ref.getRotation().angle : 0) + (p.rot || 0));
        if (turn) page.setRotation(degrees(turn));
      } else {
        const page = copies[ci++];
        if (p.rot) page.setRotation(degrees(norm(page.getRotation().angle + p.rot)));
        out.addPage(page);
      }
    }
    return save(out);
  }

  /** inputs: [{ bytes, pages?: [1-based page numbers] }] */
  async function merge(inputs) {
    if (!inputs || inputs.length < 2) throw new UserError('Add at least two PDFs to combine.');
    const out = await newDoc();
    for (const input of inputs) {
      const src = await openDoc(input.bytes);
      const total = src.getPageCount();
      const pages = input.pages && input.pages.length ? input.pages : Array.from({ length: total }, (_, i) => i + 1);
      if (pages.some(n => n < 1 || n > total)) throw new UserError('Those pages are not in this PDF.');
      const copies = await out.copyPages(src, pages.map(n => n - 1));
      copies.forEach(page => out.addPage(page));
    }
    return save(out);
  }

  // ---------- images to PDF ----------

  const A4 = [595.28, 841.89];
  const LETTER = [612, 792];

  /** images: [{ bytes, kind: 'jpg' | 'png' }]; opts: { mode: 'a4' | 'letter' | 'fit', margin, dpi } */
  async function imagesToPdf(images, opts) {
    if (!images.length) throw new UserError('Add at least one image.');
    const o = Object.assign({ mode: 'a4', margin: 0, dpi: 150 }, opts);
    const doc = await newDoc();
    for (const im of images) {
      const isPng = im.kind === 'png';
      const image = isPng ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes);
      const t = isPng ? 0 : Exif.turn(Exif.orientation(im.bytes));
      const sideways = t === 90 || t === 270;
      const shownW = sideways ? image.height : image.width;
      const shownH = sideways ? image.width : image.height;
      let pageW, pageH, bx, by, bw, bh;
      if (o.mode === 'fit') {
        const k = 72 / o.dpi;
        pageW = shownW * k; pageH = shownH * k;
        bx = 0; by = 0; bw = pageW; bh = pageH;
      } else {
        const base = o.mode === 'letter' ? LETTER : A4;
        const landscape = shownW > shownH;
        pageW = landscape ? base[1] : base[0]; pageH = landscape ? base[0] : base[1];
        const fitK = Math.min((pageW - 2 * o.margin) / shownW, (pageH - 2 * o.margin) / shownH);
        bw = shownW * fitK; bh = shownH * fitK;
        bx = (pageW - bw) / 2; by = (pageH - bh) / 2;
      }
      const page = doc.addPage([pageW, pageH]);
      // The picture turns about its anchor corner, so anchor and size depend on the turn.
      if (t === 0) page.drawImage(image, { x: bx, y: by, width: bw, height: bh });
      else if (t === 180) page.drawImage(image, { x: bx + bw, y: by + bh, width: bw, height: bh, rotate: degrees(180) });
      else if (t === 90) page.drawImage(image, { x: bx, y: by + bh, width: bh, height: bw, rotate: degrees(-90) });
      else page.drawImage(image, { x: bx + bw, y: by, width: bh, height: bw, rotate: degrees(90) });
    }
    return save(doc);
  }

  // ---------- page numbers and watermark ----------

  /** opts: { numbers?: { format, start, size, color, position, margin, pages }, watermark?: { text, size, color, opacity, angle, pages } } */
  async function stamp(bytes, opts) {
    const doc = await openDoc(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const total = pages.length;
    const all = Array.from({ length: total }, (_, i) => i + 1);
    const check = list => list.forEach(n => { if (n < 1 || n > total) throw new UserError('Those pages are not in this PDF.'); });

    const num = opts.numbers;
    if (num) {
      const targets = num.pages && num.pages.length ? num.pages : all;
      check(targets);
      const pos = String(num.position || 'bottom-center').split('-');
      for (const p of targets) {
        const label = String(num.format || '{n}').split('{n}').join(String((num.start == null ? 1 : num.start) + p - 1)).split('{total}').join(String(total));
        ensureEncodable(font, label);
        const g = geometry(pages[p - 1]);
        const w = font.widthOfTextAtSize(label, num.size);
        const m = num.margin == null ? 28 : num.margin;
        const y = pos[0] === 'top' ? m + num.size * 0.8 : g.H - m;
        const x = pos[1] === 'left' ? m : pos[1] === 'right' ? g.W - m - w : (g.W - w) / 2;
        drawTextView(pages[p - 1], font, label, { x: x, y: y, size: num.size, color: hexToRgb(num.color) });
      }
    }

    const wm = opts.watermark;
    if (wm && wm.text) {
      const targets = wm.pages && wm.pages.length ? wm.pages : all;
      check(targets);
      ensureEncodable(font, wm.text);
      const a = ((wm.angle || 0) * Math.PI) / 180;
      for (const p of targets) {
        const g = geometry(pages[p - 1]);
        // Shrink the text if it would run off this page along its direction.
        const along = Math.min(Math.abs(Math.cos(a)) > 1e-6 ? g.W / Math.abs(Math.cos(a)) : Infinity, Math.abs(Math.sin(a)) > 1e-6 ? g.H / Math.abs(Math.sin(a)) : Infinity) * 0.9;
        let size = wm.size;
        const natural = font.widthOfTextAtSize(wm.text, size);
        if (natural > along) size = Math.max(4, size * along / natural);
        const w = font.widthOfTextAtSize(wm.text, size);
        // Centre the text on the page, turned by the angle: step back half the width along the text
        // and a little below its middle, in y-up page-view terms, then convert back to y-down.
        const cx = g.W / 2, cy = g.H / 2;
        const ox = cx - (w / 2) * Math.cos(a) + size * 0.35 * Math.sin(a);
        const oy = cy + (w / 2) * Math.sin(a) + size * 0.35 * Math.cos(a);
        drawTextView(pages[p - 1], font, wm.text, { x: ox, y: oy, size: size, color: hexToRgb(wm.color), opacity: wm.opacity, angle: wm.angle || 0 });
      }
    }
    return save(doc);
  }

  // ---------- annotate and sign ----------

  /** byPage: { '1': [item, ...] } with 1-based page numbers. Item coordinates are in points on the displayed page
   *  (origin top-left): text {x,y,text,size,color,bold}, rect {x,y,w,h,fill,stroke,strokeWidth,opacity},
   *  image {x,y,w,h,bytes,kind,opacity}. */
  async function annotate(bytes, byPage) {
    const doc = await openDoc(bytes);
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const total = doc.getPageCount();
    for (const key of Object.keys(byPage)) {
      const n = Number(key);
      if (!(n >= 1 && n <= total)) throw new UserError('Those pages are not in this PDF.');
      const page = doc.getPage(n - 1);
      const g = geometry(page);
      for (const it of byPage[key]) {
        if (it.type === 'rect') {
          const a = viewToUser(g, it.x, it.y), b = viewToUser(g, it.x + it.w, it.y + it.h);
          page.drawRectangle({
            x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y),
            color: it.fill ? hexToRgb(it.fill) : undefined, opacity: it.opacity == null ? 1 : it.opacity,
            borderColor: it.stroke ? hexToRgb(it.stroke) : undefined, borderWidth: it.stroke ? it.strokeWidth || 1 : 0,
            borderOpacity: it.opacity == null ? 1 : it.opacity
          });
        } else if (it.type === 'text') {
          const font = it.bold ? bold : regular;
          const lineHeight = it.size * 1.2;
          String(it.text).split('\n').forEach(function (line, i) {
            if (!line) return;
            ensureEncodable(font, line);
            drawTextView(page, font, line, { x: it.x, y: it.y + it.size * 0.95 + i * lineHeight, size: it.size, color: hexToRgb(it.color) });
          });
        } else if (it.type === 'image') {
          const image = it.kind === 'png' ? await doc.embedPng(it.bytes) : await doc.embedJpg(it.bytes);
          const p = viewToUser(g, it.x, it.y + it.h);
          page.drawImage(image, { x: p.x, y: p.y, width: it.w, height: it.h, rotate: degrees(g.r), opacity: it.opacity == null ? 1 : it.opacity });
        }
      }
    }
    return save(doc);
  }

  // ---------- crop ----------

  /** margins in points as displayed: { top, right, bottom, left }. pages: 1-based list or null for all. */
  async function crop(bytes, margins, pages) {
    const doc = await openDoc(bytes);
    const total = doc.getPageCount();
    const targets = pages && pages.length ? pages : Array.from({ length: total }, (_, i) => i + 1);
    if (targets.some(n => n < 1 || n > total)) throw new UserError('Those pages are not in this PDF.');
    for (const n of targets) {
      const page = doc.getPage(n - 1);
      const g = geometry(page);
      const m = margins;
      let L, R, B, T;
      switch (g.r) {
        case 90: L = m.top; B = m.left; R = m.bottom; T = m.right; break;
        case 180: L = m.right; R = m.left; B = m.top; T = m.bottom; break;
        case 270: L = m.bottom; R = m.top; B = m.right; T = m.left; break;
        default: L = m.left; R = m.right; B = m.bottom; T = m.top;
      }
      const w = g.cw - L - R, h = g.ch - T - B;
      if (w < 10 || h < 10) throw new UserError('Those margins leave nothing of page ' + n + '.');
      page.setCropBox(g.cx + L, g.cy + B, w, h);
    }
    return save(doc);
  }

  // ---------- document properties ----------

  async function docInfo(bytes) {
    const doc = await openDoc(bytes);
    const first = doc.getPageCount() ? doc.getPage(0) : null;
    const g = first ? geometry(first) : null;
    return {
      pages: doc.getPageCount(),
      title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '', keywords: doc.getKeywords() || '',
      creator: doc.getCreator() || '', producer: doc.getProducer() || '',
      created: doc.getCreationDate() || null, modified: doc.getModificationDate() || null,
      hasXmp: doc.catalog.has(PDFName.of('Metadata')),
      pageWidth: g ? g.W : 0, pageHeight: g ? g.H : 0
    };
  }

  function putOrDrop(doc, key, value) {
    const info = doc.getInfoDict();
    if (value) return true;
    info.delete(PDFName.of(key));
    return false;
  }

  /** meta: { title, author, subject, keywords, creator, producer, created: ISO string, modified: ISO string }; blank removes the field. */
  async function setMetadata(bytes, meta) {
    const doc = await openDoc(bytes);
    if (putOrDrop(doc, 'Title', meta.title)) doc.setTitle(meta.title);
    if (putOrDrop(doc, 'Author', meta.author)) doc.setAuthor(meta.author);
    if (putOrDrop(doc, 'Subject', meta.subject)) doc.setSubject(meta.subject);
    if (putOrDrop(doc, 'Keywords', meta.keywords)) doc.setKeywords([meta.keywords]);
    if (putOrDrop(doc, 'Creator', meta.creator)) doc.setCreator(meta.creator);
    if (putOrDrop(doc, 'Producer', meta.producer)) doc.setProducer(meta.producer);
    const created = meta.created ? new Date(meta.created) : null;
    const modified = meta.modified ? new Date(meta.modified) : null;
    if (putOrDrop(doc, 'CreationDate', created && !isNaN(created))) doc.setCreationDate(created);
    if (putOrDrop(doc, 'ModDate', modified && !isNaN(modified))) doc.setModificationDate(modified);
    return save(doc);
  }

  /** Removes the Info fields and the XMP metadata stream. */
  async function stripMetadata(bytes) {
    const doc = await openDoc(bytes);
    const info = doc.getInfoDict();
    INFO_KEYS.forEach(k => info.delete(PDFName.of(k)));
    doc.catalog.delete(PDFName.of('Metadata'));
    return save(doc);
  }

  // ---------- forms ----------

  // instanceof, not constructor.name: the minified library mangles class names.
  function fieldType(f) {
    if (f instanceof PDFLib.PDFTextField) return 'text';
    if (f instanceof PDFLib.PDFCheckBox) return 'checkbox';
    if (f instanceof PDFLib.PDFRadioGroup) return 'radio';
    if (f instanceof PDFLib.PDFDropdown) return 'dropdown';
    if (f instanceof PDFLib.PDFOptionList) return 'list';
    if (f instanceof PDFLib.PDFButton) return 'button';
    if (f instanceof PDFLib.PDFSignature) return 'signature';
    return 'other';
  }

  async function formFields(bytes) {
    const doc = await openDoc(bytes);
    const out = [];
    doc.getForm().getFields().forEach(function (f) {
      const type = fieldType(f);
      if (type === 'button' || type === 'signature' || type === 'other') return;
      const o = { name: f.getName(), type: type, readOnly: f.isReadOnly() };
      if (type === 'text') o.value = f.getText() || '';
      else if (type === 'checkbox') o.value = f.isChecked();
      else if (type === 'radio') { o.options = f.getOptions(); o.value = f.getSelected() || ''; }
      else { o.options = f.getOptions(); const s = f.getSelected(); o.value = Array.isArray(s) ? s[0] || '' : s || ''; }
      out.push(o);
    });
    return out;
  }

  /** values: { fieldName: string | boolean }. flatten makes the filled values permanent (no longer editable). */
  async function fillForm(bytes, values, flatten) {
    const doc = await openDoc(bytes);
    const form = doc.getForm();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const name of Object.keys(values)) {
      let field;
      try { field = form.getField(name); } catch (e) { continue; }
      const v = values[name];
      const type = fieldType(field);
      try {
        if (type === 'text') { ensureEncodable(font, String(v)); field.setText(String(v)); }
        else if (type === 'checkbox') { if (v) field.check(); else field.uncheck(); }
        else if (type === 'radio' || type === 'dropdown' || type === 'list') { if (v) field.select(String(v)); }
      } catch (e) {
        if (e instanceof UserError) throw e;
        throw new UserError('Could not fill the field “' + name + '”.');
      }
    }
    form.updateFieldAppearances(font);
    if (flatten) form.flatten();
    return save(doc);
  }

  const api = {
    UserError: UserError, buildFromPlan: buildFromPlan, buildMany: buildMany, merge: merge, imagesToPdf: imagesToPdf, stamp: stamp, annotate: annotate,
    crop: crop, docInfo: docInfo, setMetadata: setMetadata, stripMetadata: stripMetadata, formFields: formFields, fillForm: fillForm,
    geometry: geometry, viewToUser: viewToUser, openDoc: openDoc
  };
  if (node) module.exports = api; else root.PdfOps = api;
})(typeof window !== 'undefined' ? window : globalThis);
