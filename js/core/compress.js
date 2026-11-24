/* Make a PDF smaller. Pure: no DOM, no network, no storage. Runs in the browser and under Node.
 *
 * Two steps, and the first one is optional:
 *  1. Pictures stored as JPEG can be shrunk (fewer pixels, lower quality). This is the only lossy step, and it is only
 *     applied to a picture when the result is clearly smaller; otherwise the original picture is kept untouched.
 *  2. A lossless tidy-up (qpdf): objects are packed together and everything is recompressed with the strongest setting.
 * The result is never larger than the file you gave it: if nothing helps, the original bytes are returned.
 *
 * The picture work is done by an injected `codec`, because decoding and encoding JPEG needs the browser (canvas) or
 * the desktop app (Electron). codec(jpegBytes, { sourceWidth, sourceHeight, width, height, quality }) -> Promise<{ bytes, width, height } | null>
 * (sourceWidth/Height are the pixel size the PDF says the stored picture has; a codec that sees something else returns null.)
 * It must give the picture as it is stored (ignoring any EXIF turning) or return null to leave that picture alone. */
(function (root) {
  'use strict';

  const node = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const PDFLib = node ? require('../../vendor/pdf-lib.min.js') : root.PDFLib;
  const PdfOps = node ? require('./pdfops.js') : root.PdfOps;
  const Qpdf = node ? require('./qpdf.js') : root.Qpdf;
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFRef, PDFNumber, PDFBool } = PDFLib;

  /** Picture settings. 'lossless' leaves every picture untouched. */
  const LEVELS = {
    lossless: { label: 'Lossless', images: false },
    balanced: { label: 'Balanced', images: true, maxEdge: 2000, quality: 0.78 },
    strong: { label: 'Smallest', images: true, maxEdge: 1400, quality: 0.6 }
  };
  const MIN_GAIN = 0.1;               // a picture is replaced only if it becomes at least 10% smaller
  const MAX_PIXELS = 120e6;           // do not try to decode absurdly large pictures

  const nameOf = o => (o instanceof PDFName ? o.decodeText() : null);

  /** The single filter name of a stream, or null if there are several / none. */
  function singleFilter(ctx, dict) {
    let f = dict.get(PDFName.of('Filter'));
    if (f instanceof PDFRef) f = ctx.lookup(f);
    if (f instanceof PDFArray) { if (f.size() !== 1) return null; f = ctx.lookup(f.get(0)); }
    return nameOf(f);
  }

  /** 3 for RGB, 1 for grey, 0 for anything we will not touch (CMYK, indexed, spot colours...). */
  function colourComponents(ctx, dict) {
    let cs = dict.get(PDFName.of('ColorSpace'));
    if (cs instanceof PDFRef) cs = ctx.lookup(cs);
    const n = nameOf(cs);
    if (n === 'DeviceRGB') return 3;
    if (n === 'DeviceGray') return 1;
    if (cs instanceof PDFArray && cs.size() >= 2 && nameOf(ctx.lookup(cs.get(0))) === 'ICCBased') {
      const icc = ctx.lookup(cs.get(1));
      const c = icc && icc.dict && ctx.lookup(icc.dict.get(PDFName.of('N')));
      const N = c instanceof PDFNumber ? c.asNumber() : 0;
      return N === 3 || N === 1 ? N : 0;
    }
    return 0;
  }

  const num = (ctx, dict, key) => { const v = ctx.lookup(dict.get(PDFName.of(key))); return v instanceof PDFNumber ? v.asNumber() : 0; };

  /**
   * Shrinks eligible JPEG pictures. Returns { bytes, changed, found, saved } where `bytes` is the original array
   * when no picture was replaced. A picture is eligible when it is a plain JPEG (RGB or grey, 8 bits, no colour key
   * mask, no decode array, not an image mask).
   */
  async function shrinkImages(bytes, o) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = doc.context;
    const level = LEVELS[o.level] || LEVELS.balanced;
    let found = 0, changed = 0, saved = 0, done = 0;
    const jobs = [];
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const d = obj.dict;
      if (nameOf(d.get(PDFName.of('Subtype'))) !== 'Image') continue;
      found++;
      if (singleFilter(ctx, d) !== 'DCTDecode') continue;
      const mask = ctx.lookup(d.get(PDFName.of('ImageMask')));
      if ((mask instanceof PDFBool && mask.asBoolean()) || d.has(PDFName.of('Mask')) || d.has(PDFName.of('Decode'))) continue;
      if (num(ctx, d, 'BitsPerComponent') !== 8 || !colourComponents(ctx, d)) continue;
      const w = num(ctx, d, 'Width'), h = num(ctx, d, 'Height');
      if (!(w > 0 && h > 0) || w * h > MAX_PIXELS) continue;
      jobs.push({ ref: ref, obj: obj, w: w, h: h });
    }
    for (const job of jobs) {
      if (o.onProgress) o.onProgress(done, jobs.length);
      done++;
      const orig = job.obj.contents;
      const scale = Math.min(1, level.maxEdge / Math.max(job.w, job.h));
      let res = null;
      try { res = await o.codec(orig, { sourceWidth: job.w, sourceHeight: job.h, width: Math.max(1, Math.round(job.w * scale)), height: Math.max(1, Math.round(job.h * scale)), quality: level.quality }); }
      catch (e) { res = null; }
      if (!res || !res.bytes || res.bytes.length > orig.length * (1 - MIN_GAIN)) continue;
      const dict = { Type: 'XObject', Subtype: 'Image', Width: res.width, Height: res.height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' };
      const stream = ctx.stream(res.bytes, dict);
      const sm = job.obj.dict.get(PDFName.of('SMask'));
      if (sm) stream.dict.set(PDFName.of('SMask'), sm);   // keep the transparency picture as it is
      ctx.assign(job.ref, stream);
      saved += orig.length - res.bytes.length;
      changed++;
    }
    if (!changed) return { bytes: bytes, changed: 0, found: found, saved: 0 };
    return { bytes: new Uint8Array(await doc.save({ useObjectStreams: true })), changed: changed, found: found, saved: saved };
  }

  /**
   * compress(bytes, { level, codec, qpdf, onProgress }) -> { bytes, before, after, images, shrunk, smaller }
   * `qpdf` is the object from Qpdf.create(factory). `bytes` in the result is the original array when nothing helped.
   */
  async function compress(bytes, o) {
    const level = LEVELS[o.level] || LEVELS.balanced;
    if (Qpdf.looksEncrypted(bytes)) throw new PdfOps.UserError('This PDF has a password. Remove it first, then compress.');
    let work = bytes, images = 0, shrunk = 0;
    if (level.images && o.codec) {
      const r = await shrinkImages(work, { level: o.level, codec: o.codec, onProgress: o.onProgress });
      images = r.found; shrunk = r.changed; work = r.bytes;
    } else {
      // count pictures anyway, so the result can say whether there were any
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFRawStream && nameOf(obj.dict.get(PDFName.of('Subtype'))) === 'Image') images++;
      }
    }
    const tidy = await o.qpdf.optimize(work);
    const best = [bytes, work, tidy].reduce((a, b) => (b.length < a.length ? b : a));
    return { bytes: best, before: bytes.length, after: best.length, images: images, shrunk: shrunk, smaller: best !== bytes };
  }

  const api = { compress: compress, shrinkImages: shrinkImages, LEVELS: LEVELS, MIN_GAIN: MIN_GAIN };
  if (node) module.exports = api; else root.Compress = api;
})(typeof window !== 'undefined' ? window : globalThis);
