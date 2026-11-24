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
