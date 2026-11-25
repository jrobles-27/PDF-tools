/* Make a PDF smaller. Pure: no DOM, no network, no storage. Runs in the browser and under Node.
 *
 * Two steps, and the first one is optional:
 *  1. Pictures (including scanned pages) can be shrunk: fewer pixels, saved as JPEG at a lower quality. This is the
 *     only lossy step. It covers JPEG pictures (even when zipped a second time) and losslessly stored colour or grey
 *     pictures. A picture is replaced only when the result is clearly smaller; otherwise it is kept untouched.
 *  2. A lossless tidy-up (qpdf): objects are packed together and everything is recompressed with the strongest setting.
 * The result is never larger than the file you gave it: if nothing helps, the original bytes are returned.
 *
 * The picture work is done by an injected `codec`, because decoding and encoding JPEG needs the browser (canvas) or
 * the desktop app (Electron):
 *   codec(data, { raw, sourceWidth, sourceHeight, width, height, quality }) -> Promise<{ bytes, width, height } | null>
 * `data` is a JPEG file, or, when `raw` is true, RGBA pixels (4 bytes each, sourceWidth x sourceHeight).
 * A JPEG codec must give the picture as it is stored (ignoring any EXIF turning) or return null to leave it alone, and
 * must return null when the JPEG is not the size the PDF says. The result is always a 3-channel JPEG. */
(function (root) {
  'use strict';

  const node = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const PDFLib = node ? require('../../vendor/pdf-lib.min.js') : root.PDFLib;
  const PdfOps = node ? require('./pdfops.js') : root.PdfOps;
  const Qpdf = node ? require('./qpdf.js') : root.Qpdf;
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFDict, PDFRef, PDFNumber, PDFBool, PDFString, PDFHexString, decodePDFRawStream } = PDFLib;

  /** Picture settings. 'lossless' leaves every picture untouched. */
  const LEVELS = {
    lossless: { label: 'Lossless', images: false },
    balanced: { label: 'Balanced', images: true, maxEdge: 2000, quality: 0.72 },
    strong: { label: 'Smallest', images: true, maxEdge: 1400, quality: 0.55 }
  };
  const MIN_GAIN = 0.1;               // a JPEG picture is replaced only if it becomes at least 10% smaller
  const MIN_GAIN_LOSSLESS = 0.3;      // turning a lossless picture into JPEG must earn clearly more than that
  const MIN_LOSSLESS_BYTES = 30000;   // small lossless pictures (icons, logos) are left alone
  const MAX_PIXELS = 60e6;            // do not try to decode absurdly large pictures

  // Filters that only wrap the data, which we can undo exactly.
  const WRAPPERS = ['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode'];

  const key = n => PDFName.of(n);
  const nameOf = o => (o instanceof PDFName ? o.decodeText() : null);
  const look = (ctx, o) => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const get = (ctx, dict, k) => look(ctx, dict.get(key(k)));
  const num = (ctx, dict, k, fallback) => { const v = get(ctx, dict, k); return v instanceof PDFNumber ? v.asNumber() : fallback === undefined ? 0 : fallback; };

  /** The stream's filters in order, each with its parameter dictionary (or null). */
  function filtersOf(ctx, dict) {
    const f = get(ctx, dict, 'Filter');
    const p = get(ctx, dict, 'DecodeParms');
    const names = f instanceof PDFArray ? f.asArray().map(x => nameOf(look(ctx, x))) : f ? [nameOf(f)] : [];
    return names.map(function (name, i) {
      const parm = p instanceof PDFArray ? look(ctx, p.get(i)) : i === 0 ? p : null;
      return { name: name, parms: parm instanceof PDFDict ? parm : null };
    });
  }

  /** Undo the PNG or TIFF "predictor" that some PDFs apply before zipping. */
  function unpredict(ctx, data, parms) {
    const predictor = parms ? num(ctx, parms, 'Predictor', 1) : 1;
    if (predictor <= 1) return data;
    const colors = num(ctx, parms, 'Colors', 1), bpc = num(ctx, parms, 'BitsPerComponent', 8), columns = num(ctx, parms, 'Columns', 1);
    const row = Math.ceil(colors * bpc * columns / 8), bpp = Math.max(1, Math.ceil(colors * bpc / 8));
    if (predictor === 2) {
      if (bpc !== 8) return null;
      const out = data.slice(0, Math.floor(data.length / row) * row);
      for (let r = 0; r < out.length; r += row) for (let i = colors; i < row; i++) out[r + i] = (out[r + i] + out[r + i - colors]) & 255;
      return out;
    }
    const rows = Math.floor(data.length / (row + 1));
    const out = new Uint8Array(rows * row);
    for (let y = 0; y < rows; y++) {
      const type = data[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
      for (let i = 0; i < row; i++) {
        const left = i >= bpp ? out[dst + i - bpp] : 0, up = y ? out[dst + i - row] : 0;
        let v = data[src + i];
        if (type === 1) v += left;
        else if (type === 2) v += up;
        else if (type === 3) v += (left + up) >> 1;
        else if (type === 4) {
          const corner = y && i >= bpp ? out[dst + i - row - bpp] : 0;
          const q = left + up - corner, a = Math.abs(q - left), b = Math.abs(q - up), c = Math.abs(q - corner);
          v += a <= b && a <= c ? left : b <= c ? up : corner;
        }
        out[dst + i] = v & 255;
      }
    }
    return out;
  }

  /** Removes wrapper filters (and their predictors). Returns null if any step is not one we can undo exactly. */
  function unwrap(ctx, data, filters) {
    let out = data;
    for (const f of filters) {
      if (WRAPPERS.indexOf(f.name) < 0) return null;
      const dict = { Filter: key(f.name) };
      if (f.parms) dict.DecodeParms = f.parms;
      out = decodePDFRawStream(PDFRawStream.of(ctx.obj(dict), out)).decode();
      if (f.name === 'FlateDecode' || f.name === 'LZWDecode') out = unpredict(ctx, out, f.parms);
      if (!out) return null;
    }
    return out;
  }

  /** 3 for RGB, 1 for grey, 0 for anything else (CMYK, spot colours, Lab...). */
  function components(ctx, cs) {
    const n = nameOf(cs);
    if (n === 'DeviceRGB' || n === 'CalRGB') return 3;
    if (n === 'DeviceGray' || n === 'CalGray') return 1;
    if (cs instanceof PDFArray && cs.size() >= 2) {
      const kind = nameOf(look(ctx, cs.get(0)));
      if (kind === 'CalRGB') return 3;
      if (kind === 'CalGray') return 1;
      if (kind === 'ICCBased') {
        const icc = look(ctx, cs.get(1));
        const N = icc && icc.dict ? num(ctx, icc.dict, 'N') : 0;
        return N === 3 || N === 1 ? N : 0;
      }
    }
    return 0;
  }

  /** How the samples are coloured: { n } for grey/RGB, { n: 1, palette, base } for a colour table, or null. */
  function colourOf(ctx, dict) {
    const cs = get(ctx, dict, 'ColorSpace');
    const direct = components(ctx, cs);
    if (direct) return { n: direct };
    if (!(cs instanceof PDFArray) || cs.size() < 4 || nameOf(look(ctx, cs.get(0))) !== 'Indexed') return null;
    const base = components(ctx, look(ctx, cs.get(1)));
    let table = look(ctx, cs.get(3));
    if (table instanceof PDFString || table instanceof PDFHexString) table = table.asBytes();
    else if (table instanceof PDFRawStream) table = unwrap(ctx, table.contents, filtersOf(ctx, table.dict));
    else table = null;
    return base && table ? { n: 1, base: base, palette: table } : null;
  }

  /** Turns the stored samples into RGBA, or null if there are fewer bytes than the picture needs. */
  function toRgba(samples, w, h, bits, colour) {
    const row = Math.ceil(w * colour.n * bits / 8);
    if (samples.length < row * h) return null;
    const out = new Uint8Array(w * h * 4);
    const max = (1 << bits) - 1;
    for (let y = 0, o = 0; y < h; y++) {
      const start = y * row;
      for (let x = 0; x < w; x++, o += 4) {
        let r, g, b;
        if (colour.palette) {
          const index = bits === 8 ? samples[start + x] : (samples[start + ((x * bits) >> 3)] >> (8 - bits - ((x * bits) & 7))) & max;
          const p = index * colour.base;
          r = colour.palette[p] || 0;
          g = colour.base === 3 ? colour.palette[p + 1] || 0 : r;
          b = colour.base === 3 ? colour.palette[p + 2] || 0 : r;
        } else if (colour.n === 3) {
          const p = start + x * 3;
          r = samples[p]; g = samples[p + 1]; b = samples[p + 2];
        } else {
          r = g = b = samples[start + x];
        }
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
      }
    }
    return out;
  }

  /**
   * Looks at one picture. Returns { job } if it may be shrunk, or { skip: reason } with reason one of
   * 'jpx' (JPEG 2000), 'mono' (black and white), 'colour' (CMYK or special inks), 'small', 'other'.
   */
  function inspect(ctx, obj) {
    const d = obj.dict;
    const mask = get(ctx, d, 'ImageMask');
    const bits = num(ctx, d, 'BitsPerComponent');
    const filters = filtersOf(ctx, d);
    const names = filters.map(f => f.name);
    if (names.indexOf('JPXDecode') >= 0) return { skip: 'jpx' };
    if ((mask instanceof PDFBool && mask.asBoolean()) || bits === 1 || names.indexOf('CCITTFaxDecode') >= 0 || names.indexOf('JBIG2Decode') >= 0) return { skip: 'mono' };
    if (d.has(key('Mask')) || d.has(key('Decode'))) return { skip: 'other' };
    const soft = get(ctx, d, 'SMask');
    if (soft && soft.dict && soft.dict.has(key('Matte'))) return { skip: 'other' };   // its mask must keep the same size
    const colour = colourOf(ctx, d);
    if (!colour) return { skip: 'colour' };
    const w = num(ctx, d, 'Width'), h = num(ctx, d, 'Height');
    if (!(w > 0 && h > 0) || w * h > MAX_PIXELS) return { skip: 'other' };
    const jpeg = names[names.length - 1] === 'DCTDecode';
    if (jpeg) {
      if (bits !== 8 || colour.palette) return { skip: 'other' };
      return { job: { w: w, h: h, jpeg: true, filters: filters.slice(0, -1) } };
    }
    if (names.some(n => WRAPPERS.indexOf(n) < 0)) return { skip: 'other' };
    if (colour.palette ? [2, 4, 8].indexOf(bits) < 0 : bits !== 8) return { skip: 'other' };
    if (obj.contents.length < MIN_LOSSLESS_BYTES) return { skip: 'small' };
    return { job: { w: w, h: h, jpeg: false, filters: filters, bits: bits, colour: colour } };
  }

  /**
   * Shrinks eligible pictures. Returns { bytes, changed, found, saved, skipped } where `bytes` is the original array
   * when no picture was replaced, and `skipped` counts pictures left alone by reason ('kept' = would not shrink enough).
   * Transparency masks are never touched.
   */
  async function shrinkImages(bytes, o) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const ctx = doc.context;
    const level = LEVELS[o.level] || LEVELS.balanced;
    const pictures = [], masks = new Set();
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream) || nameOf(obj.dict.get(key('Subtype'))) !== 'Image') continue;
      pictures.push({ ref: ref, obj: obj });
      for (const k of ['SMask', 'Mask']) { const m = obj.dict.get(key(k)); if (m instanceof PDFRef) masks.add(m.toString()); }
    }
    let found = 0, changed = 0, saved = 0, done = 0;
    const skipped = {}, jobs = [];
    const skip = reason => { skipped[reason] = (skipped[reason] || 0) + 1; };
    for (const p of pictures) {
      if (masks.has(p.ref.toString())) continue;
      found++;
      let look1;
      try { look1 = inspect(ctx, p.obj); } catch (e) { look1 = { skip: 'other' }; }
      if (look1.skip) skip(look1.skip);
      else jobs.push(Object.assign(look1.job, p));
    }
    for (const job of jobs) {
      if (o.onProgress) o.onProgress(done, jobs.length);
      done++;
      const orig = job.obj.contents;
      const scale = Math.min(1, level.maxEdge / Math.max(job.w, job.h));
      let res = null, failed = false;
      try {
        let data = unwrap(ctx, orig, job.filters);
        if (data && !job.jpeg) data = toRgba(data, job.w, job.h, job.bits, job.colour);
        if (data) {
          res = await o.codec(data, { raw: !job.jpeg, sourceWidth: job.w, sourceHeight: job.h,
            width: Math.max(1, Math.round(job.w * scale)), height: Math.max(1, Math.round(job.h * scale)), quality: level.quality });
        }
        failed = !res || !res.bytes;
      } catch (e) { failed = true; }
      if (failed) { skip('other'); continue; }
      if (res.bytes.length > orig.length * (1 - (job.jpeg ? MIN_GAIN : MIN_GAIN_LOSSLESS))) { skip('kept'); continue; }
      const stream = ctx.stream(res.bytes, { Type: 'XObject', Subtype: 'Image', Width: res.width, Height: res.height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' });
      const sm = job.obj.dict.get(key('SMask'));
      if (sm) stream.dict.set(key('SMask'), sm);   // keep the transparency picture as it is
      ctx.assign(job.ref, stream);
      saved += orig.length - res.bytes.length;
      changed++;
    }
    const out = changed ? new Uint8Array(await doc.save({ useObjectStreams: true })) : bytes;
    return { bytes: out, changed: changed, found: found, saved: saved, skipped: skipped };
  }

  /**
   * compress(bytes, { level, codec, qpdf, onProgress }) -> { bytes, before, after, images, shrunk, skipped, smaller }
   * `qpdf` is the object from Qpdf.create(factory). `bytes` in the result is the original array when nothing helped.
   */
  async function compress(bytes, o) {
    const level = LEVELS[o.level] || LEVELS.balanced;
    if (Qpdf.looksEncrypted(bytes)) throw new PdfOps.UserError('This PDF has a password. Remove it first, then compress.');
    let work = bytes, images = 0, shrunk = 0, skipped = {};
    if (level.images && o.codec) {
      const r = await shrinkImages(work, { level: o.level, codec: o.codec, onProgress: o.onProgress });
      images = r.found; shrunk = r.changed; work = r.bytes; skipped = r.skipped;
    } else {
      // count pictures anyway, so the result can say whether there were any
      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFRawStream && nameOf(obj.dict.get(key('Subtype'))) === 'Image') images++;
      }
    }
    const tidy = await o.qpdf.optimize(work);
    const best = [bytes, work, tidy].reduce((a, b) => (b.length < a.length ? b : a));
    return { bytes: best, before: bytes.length, after: best.length, images: images, shrunk: shrunk, skipped: skipped, smaller: best !== bytes };
  }

  /** One plain sentence saying why some pictures were left as they were, or '' if none were. */
  function explainSkipped(skipped) {
    const why = { jpx: 'stored as JPEG 2000', mono: 'black and white (already compact)', colour: 'in print (CMYK) or special colours',
      small: 'too small to matter', kept: 'already as small as this setting makes them', other: 'in a form this tool does not change' };
    const parts = Object.keys(why).filter(k => skipped && skipped[k]).map(k => skipped[k] + ' ' + why[k]);
    return parts.length ? 'Pictures left as they were: ' + parts.join(', ') + '.' : '';
  }

  const api = { compress: compress, shrinkImages: shrinkImages, explainSkipped: explainSkipped, unpredict: unpredict, LEVELS: LEVELS, MIN_GAIN: MIN_GAIN };
  if (node) module.exports = api; else root.Compress = api;
})(typeof window !== 'undefined' ? window : globalThis);
