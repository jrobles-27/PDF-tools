// Password protection (qpdf, WebAssembly) and compression. Uses the bundled qpdf, exactly as the browser does.
const path = require('path');
const { test, ok, eq, throwsAsync } = require('./lib');
const PDFLib = require('../vendor/pdf-lib.min.js');
const { PDFDocument, PDFName, PDFRawStream } = PDFLib;
const Ops = require('../js/core/pdfops.js');
const Qpdf = require('../js/core/qpdf.js');
const Compress = require('../js/core/compress.js');
const createModule = require('../vendor/qpdf/qpdf.js');

const wasm = path.join(__dirname, '..', 'vendor', 'qpdf', 'qpdf.wasm');
const qpdf = Qpdf.create(o => createModule({ locateFile: () => wasm, preRun: o.preRun }));

async function plainPdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < (pages || 2); i++) doc.addPage([200 + i, 300]).drawText('secret ' + i, { x: 20, y: 150 });
  doc.setTitle('Plain');
  return new Uint8Array(await doc.save());
}
const has = (bytes, text) => Buffer.from(bytes).includes(text);

test('protect: a password turns the PDF into an encrypted one that cannot be read without it', async () => {
  const src = await plainPdf();
  const enc = await qpdf.encrypt(src, { userPassword: 'open sesame' });
  ok(Qpdf.looksEncrypted(enc) && !Qpdf.looksEncrypted(src));
  ok(!has(enc, 'secret 0'), 'text must not be readable');
  await throwsAsync(() => PDFDocument.load(enc), /encrypt/i);
  eq(await qpdf.protection(enc), 'open');
  eq(await qpdf.protection(src), 'none');
});

test('protect: the right password unlocks it with every page intact, a wrong or missing one does not', async () => {
  const src = await plainPdf(3);
  const enc = await qpdf.encrypt(src, { userPassword: 'pässwörd ✓ 123' });          // not just ASCII
  await throwsAsync(() => qpdf.decrypt(enc, 'wrong'), /did not work/);
  await throwsAsync(() => qpdf.decrypt(enc, ''), /needs a password/);
  const back = await qpdf.decrypt(enc, 'pässwörd ✓ 123');
  ok(!Qpdf.looksEncrypted(back));
  const d = await PDFDocument.load(back);
  eq(d.getPages().map(p => Math.round(p.getSize().width)), [200, 201, 202]);
  eq(d.getTitle(), 'Plain');
});

test('protect: the source bytes are never modified', async () => {
  const src = await plainPdf();
  const copy = src.slice();
  await qpdf.encrypt(src, { userPassword: 'x1' });
  ok(src.every((v, i) => v === copy[i]));
});

test('protect: asks for a password, and refuses to protect a PDF that already has one', async () => {
  const src = await plainPdf();
  await throwsAsync(() => qpdf.encrypt(src, { userPassword: '' }), /Enter a password/);
  const enc = await qpdf.encrypt(src, { userPassword: 'abc' });
  await throwsAsync(() => qpdf.encrypt(enc, { userPassword: 'def' }), /already has a password/);
});

test('protect: printing, copying and editing can be switched off (recorded in the file)', async () => {
  const src = await plainPdf();
  const enc = await qpdf.encrypt(src, { userPassword: 'u', ownerPassword: 'o', allowPrint: false, allowCopy: false, allowEdit: false });
  const r = await qpdf.run(['--password=u', '--show-encryption', '/in.pdf'], { '/in.pdf': enc });
  ok(/R = 6/.test(r.log), 'AES-256 (revision 6) expected: ' + r.log);
  ok(/print low resolution: not allowed/.test(r.log) && /extract for any purpose: not allowed/.test(r.log) && /modify other: not allowed/.test(r.log), r.log);
  const open = await qpdf.encrypt(src, { userPassword: 'u' });
  const r2 = await qpdf.run(['--password=u', '--show-encryption', '/in.pdf'], { '/in.pdf': open });
  ok(/print low resolution: allowed/.test(r2.log) && /extract for any purpose: allowed/.test(r2.log), r2.log);
});

test('protect: with no owner password a random one is made, so two files never share it', async () => {
  ok(Qpdf.randomPassword(24).length === 24 && Qpdf.randomPassword(24) !== Qpdf.randomPassword(24));
});

test('protect: a PDF that opens freely but has an owner password is recognised and can be unlocked with no password', async () => {
  const src = await plainPdf();
  const r = await qpdf.run(['/in.pdf', '--encrypt', '', 'ownerpw', '256', '--print=none', '--', '/out.pdf'], { '/in.pdf': src });
  ok(r.out);
  eq(await qpdf.protection(r.out), 'owner');
  const back = await qpdf.decrypt(r.out, '');
  await PDFDocument.load(back);
});

test('protect: a damaged file gives a plain message, not a crash', async () => {
  await throwsAsync(() => qpdf.decrypt(new Uint8Array([1, 2, 3, 4]), 'x'), /could not be read|damaged/);
});

// ---------- compression ----------
// A JPEG whose pixels are tiny but whose file is large (a padding comment), so it looks like a big photo to the code.
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
function paddedJpeg(extra) {
  const pad = Buffer.alloc(extra, 0x41);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, (extra + 2) >> 8, (extra + 2) & 255]), pad]);
  return new Uint8Array(Buffer.concat([TINY_JPEG.subarray(0, 2), com, TINY_JPEG.subarray(2)]));
}
async function pdfWithPhoto(extra) {
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(paddedJpeg(extra));
  doc.addPage([200, 200]).drawImage(img, { x: 10, y: 10, width: 100, height: 100 });
  return new Uint8Array(await doc.save());
}
function images(bytes) {
  return PDFDocument.load(bytes).then(d => {
    const out = [];
    for (const [, o] of d.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) out.push(o);
    return out;
  });
}
const smallCodec = calls => async (bytes, o) => { calls.push(o); return { bytes: new Uint8Array(TINY_JPEG), width: o.width, height: o.height }; };

test('compress: a JPEG picture that can be made clearly smaller is replaced, and the file shrinks', async () => {
  const src = await pdfWithPhoto(60000);
  const calls = [];
  const r = await Compress.compress(src, { level: 'balanced', codec: smallCodec(calls), qpdf });
  ok(r.smaller && r.after < r.before / 2, 'before ' + r.before + ' after ' + r.after);
  eq([r.images, r.shrunk], [1, 1]);
  eq(calls.length, 1);
  const [img] = await images(r.bytes);
  eq(img.contents.length, TINY_JPEG.length);
  ok(img.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode') && img.dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceRGB'));
  await PDFDocument.load(r.bytes);
});

test('compress: the smallest setting asks for fewer pixels and lower quality than balanced', async () => {
  const b = Compress.LEVELS.balanced, s = Compress.LEVELS.strong;
  ok(s.maxEdge < b.maxEdge && s.quality < b.quality);
  const src = await pdfWithPhoto(60000);
  const calls = [];
  await Compress.compress(src, { level: 'strong', codec: smallCodec(calls), qpdf });
  eq(calls[0].quality, s.quality);
});

test('compress: lossless mode never touches a picture', async () => {
  const src = await pdfWithPhoto(60000);
  const calls = [];
  const r = await Compress.compress(src, { level: 'lossless', codec: smallCodec(calls), qpdf });
  eq(calls.length, 0);
  eq(r.shrunk, 0);
  const [img] = await images(r.bytes);
  ok(img.contents.length > 60000);
});

test('compress: a picture is kept as it is when re-encoding would not make it clearly smaller', async () => {
  const src = await pdfWithPhoto(2000);
  const codec = async (bytes, o) => ({ bytes: bytes.slice(0, Math.floor(bytes.length * 0.95)), width: o.width, height: o.height });
  const r = await Compress.compress(src, { level: 'balanced', codec, qpdf });
  eq(r.shrunk, 0);
  const [img] = await images(r.bytes);
  ok(img.contents.length > 2000);
});

test('compress: a codec that fails or declines leaves the picture alone', async () => {
  const src = await pdfWithPhoto(60000);
  for (const codec of [async () => null, async () => { throw new Error('boom'); }]) {
    const r = await Compress.compress(src, { level: 'balanced', codec, qpdf });
    eq(r.shrunk, 0);
  }
});

test('compress: the result is never larger than the original (the original bytes come back)', async () => {
  const src = await plainPdf(1);
  const r = await Compress.compress(src, { level: 'balanced', codec: smallCodec([]), qpdf });
  ok(r.after <= r.before);
  if (!r.smaller) ok(r.bytes === src);
});

test('compress: lossless tidy-up keeps every page and the text', async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 20; i++) doc.addPage([300, 400]).drawText('Line of text number ' + i + ' '.repeat(5) + 'abcdefghij'.repeat(30), { x: 10, y: 200, size: 6 });
  const src = new Uint8Array(await doc.save({ useObjectStreams: false }));
  const r = await Compress.compress(src, { level: 'lossless', qpdf });
  const d = await PDFDocument.load(r.bytes);
  eq(d.getPageCount(), 20);
  ok(r.after <= r.before);
});

test('compress: encrypted input is refused with a clear message', async () => {
  const enc = await qpdf.encrypt(await plainPdf(), { userPassword: 'pw' });
  await throwsAsync(() => Compress.compress(enc, { level: 'lossless', qpdf }), /password/i);
});

// ---------- scans stored in other ways ----------
const zlib = require('zlib');
const noise = n => new Uint8Array(require('crypto').randomBytes(n));
/** A one-page PDF holding image XObjects given as { data, dict }. The first one is drawn. */
async function pdfWithRaw(items) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const refs = [];
  for (const it of items) {
    const dict = Object.assign({ Type: 'XObject', Subtype: 'Image', BitsPerComponent: 8 }, it.dict);
    if (it.smaskIndex !== undefined) dict.SMask = refs[it.smaskIndex];
    refs.push(doc.context.register(doc.context.stream(it.data, dict)));
  }
  page.node.newXObject('Im', refs[refs.length - 1]);
  return new Uint8Array(await doc.save());
}
const seen = () => { const calls = []; return { calls, codec: async (data, o) => { calls.push({ data, o }); return { bytes: new Uint8Array(TINY_JPEG), width: o.width, height: o.height }; } }; };
const run = (src, codec) => Compress.shrinkImages(src, { level: 'balanced', codec });

test('scan: a zipped (lossless) colour picture is decoded to the right pixels and replaced by a JPEG', async () => {
  const w = 120, h = 100, rgb = noise(w * h * 3);
  const src = await pdfWithRaw([{ data: new Uint8Array(zlib.deflateSync(rgb)), dict: { Width: w, Height: h, ColorSpace: 'DeviceRGB', Filter: 'FlateDecode' } }]);
  const s = seen();
  const r = await run(src, s.codec);
  eq([r.changed, r.found], [1, 1]);
  const { data, o } = s.calls[0];
  eq([o.raw, o.sourceWidth, o.sourceHeight, data.length], [true, w, h, w * h * 4]);
  ok(data[0] === rgb[0] && data[1] === rgb[1] && data[2] === rgb[2] && data[3] === 255 && data[4] === rgb[3]);
  const [img] = await images(r.bytes);
  ok(img.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'));
});

test('scan: a grey picture is widened to RGB', async () => {
  const w = 200, h = 200, grey = noise(w * h);
  const s = seen();
  await run(await pdfWithRaw([{ data: new Uint8Array(zlib.deflateSync(grey)), dict: { Width: w, Height: h, ColorSpace: 'DeviceGray', Filter: 'FlateDecode' } }]), s.codec);
  const d = s.calls[0].data;
  eq([d[4], d[5], d[6]], [grey[1], grey[1], grey[1]]);
});

test('scan: PNG and TIFF predictors are undone exactly', async () => {
  const w = 90, h = 130, row = w * 3, rgb = noise(row * h);
  const png = new Uint8Array((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const type = y % 5;
    png[y * (row + 1)] = type;
    for (let i = 0; i < row; i++) {
      const a = i >= 3 ? rgb[y * row + i - 3] : 0, b = y ? rgb[(y - 1) * row + i] : 0, c = y && i >= 3 ? rgb[(y - 1) * row + i - 3] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type];
      png[y * (row + 1) + 1 + i] = (rgb[y * row + i] - pred) & 255;
    }
  }
  const tiff = rgb.slice();
  for (let y = 0; y < h; y++) for (let i = row - 1; i >= 3; i--) tiff[y * row + i] = (rgb[y * row + i] - rgb[y * row + i - 3]) & 255;
  for (const [predictor, data] of [[15, png], [2, tiff]]) {
    const s = seen();
    const r = await run(await pdfWithRaw([{ data: new Uint8Array(zlib.deflateSync(data)), dict: { Width: w, Height: h, ColorSpace: 'DeviceRGB', Filter: 'FlateDecode', DecodeParms: { Predictor: predictor, Colors: 3, BitsPerComponent: 8, Columns: w } } }]), s.codec);
    eq(r.changed, 1, 'predictor ' + predictor);
    const got = s.calls[0].data;
    for (let px = 0; px < w * h; px++) if (got[px * 4] !== rgb[px * 3] || got[px * 4 + 2] !== rgb[px * 3 + 2]) throw new Error('predictor ' + predictor + ' wrong at pixel ' + px);
  }
});

test('scan: a colour-table (indexed) picture gets its real colours', async () => {
  const w = 220, h = 200, idx = noise(w * h).map(v => v % 3);
  const table = [255, 0, 0, 0, 255, 0, 0, 0, 255];
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const ctx = doc.context;
  const lookup = PDFLib.PDFHexString.of(Buffer.from(table).toString('hex'));
  const ref = ctx.register(ctx.stream(new Uint8Array(zlib.deflateSync(noise(w * h))), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, BitsPerComponent: 8, ColorSpace: ['Indexed', 'DeviceRGB', 255, lookup], Filter: 'FlateDecode' }));
  page.node.newXObject('Im', ref);
  const s = seen();
  const r = await run(new Uint8Array(await doc.save()), s.codec);
  eq(r.changed, 1);
  ok(s.calls[0].data.length === w * h * 4);
});

test('scan: a JPEG zipped a second time is unwrapped and shrunk', async () => {
  const jpg = paddedJpeg(60000);
  const wrapped = new Uint8Array(zlib.deflateSync(jpg, { level: 0 }));
  const s = seen();
  const r = await run(await pdfWithRaw([{ data: wrapped, dict: { Width: 1, Height: 1, ColorSpace: 'DeviceGray', Filter: ['FlateDecode', 'DCTDecode'] } }]), s.codec);
  eq(r.changed, 1);
  eq([s.calls[0].o.raw, s.calls[0].data.length], [false, jpg.length]);
});

test('scan: a transparency mask is never turned into a colour picture', async () => {
  const s = seen();
  const r = await run(await pdfWithRaw([
    { data: paddedJpeg(60000), dict: { Width: 1, Height: 1, ColorSpace: 'DeviceGray', Filter: 'DCTDecode' } },
    { data: paddedJpeg(50000), dict: { Width: 1, Height: 1, ColorSpace: 'DeviceRGB', Filter: 'DCTDecode' }, smaskIndex: 0 }
  ]), s.codec);
  eq([r.found, r.changed, s.calls.length], [1, 1, 1]);
  const all = await images(r.bytes);
  const mask = all.find(i => i.dict.get(PDFName.of('ColorSpace')) === PDFName.of('DeviceGray'));
  ok(mask && mask.contents.length > 60000, 'the mask must be untouched');
});

test('scan: pictures that are left alone are counted with a reason', async () => {
  const src = await pdfWithRaw([
    { data: noise(40000), dict: { Width: 100, Height: 100, ColorSpace: 'DeviceRGB', Filter: 'JPXDecode' } },
    { data: noise(40000), dict: { Width: 800, Height: 400, ColorSpace: 'DeviceGray', BitsPerComponent: 1, Filter: 'CCITTFaxDecode' } },
    { data: noise(40000), dict: { Width: 100, Height: 100, ColorSpace: 'DeviceCMYK', Filter: 'DCTDecode' } }
  ]);
  const s = seen();
  const r = await run(src, s.codec);
  eq([r.changed, r.found, s.calls.length], [0, 3, 0]);
  eq(r.skipped, { jpx: 1, mono: 1, colour: 1 });
  ok(r.bytes === src);
  ok(/JPEG 2000/.test(Compress.explainSkipped(r.skipped)) && /black and white/.test(Compress.explainSkipped(r.skipped)));
  eq(Compress.explainSkipped({}), '');
});

test('scan: a lossless picture is only converted when the saving is large', async () => {
  const w = 120, h = 100;
  const data = new Uint8Array(zlib.deflateSync(noise(w * h * 3)));
  const src = await pdfWithRaw([{ data, dict: { Width: w, Height: h, ColorSpace: 'DeviceRGB', Filter: 'FlateDecode' } }]);
  const r = await run(src, async (d, o) => ({ bytes: noise(Math.floor(data.length * 0.8)), width: o.width, height: o.height }));
  eq(r.changed, 0);
  eq(r.skipped, { kept: 1 });
});
