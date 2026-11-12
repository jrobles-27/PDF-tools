const path = require('path');
const { test, ok, eq, near, throwsAsync } = require('./lib');
const Ranges = require('../js/core/ranges.js');
const Zip = require('../js/core/zip.js');
const Exif = require('../js/core/exif.js');
const Ops = require('../js/core/pdfops.js');
const PDFLib = require('../vendor/pdf-lib.min.js');
const { PDFDocument, PDFName, degrees } = PDFLib;

// ---- helpers: PDFs whose pages are identified by their width (100 + n), so order can be checked without rendering ----
async function makePdf(widths, opts) {
  const doc = await PDFDocument.create();
  widths.forEach(w => doc.addPage([w, 200]));
  if (opts && opts.title) doc.setTitle(opts.title);
  return new Uint8Array(await doc.save());
}
async function widthsOf(bytes) {
  const d = await PDFDocument.load(bytes);
  return d.getPages().map(p => Math.round(p.getSize().width));
}
async function rotationsOf(bytes) {
  const d = await PDFDocument.load(bytes);
  return d.getPages().map(p => ((p.getRotation().angle % 360) + 360) % 360);
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
function tinyPng(w, h) {
  const zlib = require('zlib');
  const crcTable = Zip; // crc32 reused from the zip module
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crcTable.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
// JPEG with an EXIF orientation tag spliced in after the SOI marker
function jpegWithOrientation(o, little) {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write(little ? 'II' : 'MM', 0);
  const w16 = (v, off) => (little ? tiff.writeUInt16LE(v, off) : tiff.writeUInt16BE(v, off));
  const w32 = (v, off) => (little ? tiff.writeUInt32LE(v, off) : tiff.writeUInt32BE(v, off));
  w16(42, 2); w32(8, 4); w16(1, 8); w16(0x0112, 10); w16(3, 12); w32(1, 14); w16(o, 18);
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
  return new Uint8Array(Buffer.concat([TINY_JPEG.subarray(0, 2), seg, TINY_JPEG.subarray(2)]));
}

// ---------------------------------------------------------------- ranges
test('ranges: the forms that are accepted', () => {
  const p = (s, n) => { const r = Ranges.parse(s, n == null ? 12 : n); return r.ok ? r.pages : r.error; };
  eq(p('1-4, 8-9'), [1, 2, 3, 4, 8, 9]);
  eq(p('1-4 8-9'), [1, 2, 3, 4, 8, 9]);
  eq(p('5-'), [5, 6, 7, 8, 9, 10, 11, 12]);
  eq(p('-3'), [1, 2, 3]);
  eq(p('last'), [12]);
  eq(p('3-last'), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  eq(p('all', 5), [1, 2, 3, 4, 5]);
  eq(p('4-1'), [4, 3, 2, 1]);
  eq(p('2,2,3'), [2, 2, 3]);
  eq(p('1 - 3 , 7'), [1, 2, 3, 7]);
  eq(p('1-4,,9'), [1, 2, 3, 4, 9]);
});
test('ranges: mistakes get a plain-language error', () => {
  const bad = (s, n) => { const r = Ranges.parse(s, n == null ? 12 : n); ok(!r.ok, s + ' should fail'); return r.error; };
  ok(/start at 1/.test(bad('0')));
  ok(/Page 13 does not exist.*12 pages/.test(bad('13')));
  ok(/not a page/.test(bad('abc')));
  ok(/Enter the pages/.test(bad('')));
  ok(/1 page\./.test(bad('2', 1)));
});
test('ranges: compress is the inverse of a plain selection', () => {
  eq(Ranges.compress([1, 2, 3, 8, 9]), '1-3, 8-9');
  eq(Ranges.compress([9, 1, 2, 2, 3]), '1-3, 9');
  eq(Ranges.compress([]), '');
  const r = Ranges.parse(Ranges.compress([2, 3, 4, 7, 10, 11]), 12);
  eq(r.pages, [2, 3, 4, 7, 10, 11]);
});

// ---------------------------------------------------------------- zip
test('zip: entries can be read back and the checksums are right', async () => {
  const files = [{ name: 'a.txt', data: new Uint8Array(Buffer.from('hello')) }, { name: 'dir/b é.bin', data: new Blob([new Uint8Array([1, 2, 3, 250])]) }];
  const buf = Buffer.from(await (await Zip.build(files)).arrayBuffer());
  const end = buf.length - 22;
  eq(buf.readUInt32LE(end), 0x06054b50);
  eq(buf.readUInt16LE(end + 10), 2);
  let p = buf.readUInt32LE(end + 16);
  const got = [];
  for (let i = 0; i < 2; i++) {
    eq(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    eq(Zip.crc32(data), crc, 'crc of ' + name);
    got.push([name, [...data]]);
    p += 46 + nameLen;
  }
  eq(got, [['a.txt', [...Buffer.from('hello')]], ['dir/b é.bin', [1, 2, 3, 250]]]);
});
test('zip: crc32 matches the standard check value', () => {
  eq(Zip.crc32(new Uint8Array(Buffer.from('123456789'))), 0xcbf43926);
});

// ---------------------------------------------------------------- exif
test('exif: orientation is read in both byte orders, and defaults to 1', () => {
  for (let o = 1; o <= 8; o++) {
    eq(Exif.orientation(jpegWithOrientation(o, true)), o, 'little-endian ' + o);
    eq(Exif.orientation(jpegWithOrientation(o, false)), o, 'big-endian ' + o);
  }
  eq(Exif.orientation(new Uint8Array(TINY_JPEG)), 1);
  eq(Exif.orientation(new Uint8Array([1, 2, 3])), 1);
  eq([6, 8, 3, 1].map(o => Exif.turn(o)), [90, 270, 180, 0]);
});

// ---------------------------------------------------------------- organize / extract / split
test('plan: extracting 1-4, 8-9 keeps exactly those pages in order', async () => {
  const src = await makePdf([101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
  const keep = Ranges.parse('1-4, 8-9', 12).pages;
  const out = await Ops.buildFromPlan(src, keep.map(n => ({ src: n - 1, rot: 0 })));
  eq(await widthsOf(out), [101, 102, 103, 104, 108, 109]);
});
test('plan: reorder, duplicate, reverse and delete', async () => {
  const src = await makePdf([101, 102, 103, 104]);
  const out = await Ops.buildFromPlan(src, [3, 3, 0, 2].map(i => ({ src: i, rot: 0 })));
  eq(await widthsOf(out), [104, 104, 101, 103]);
  const removed = await Ops.buildFromPlan(src, [0, 3].map(i => ({ src: i, rot: 0 })));
  eq(await widthsOf(removed), [101, 104]);
});
test('plan: rotation adds to what is already there, and blank pages use the first page size', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([111, 200]).setRotation(degrees(90));
  doc.addPage([122, 200]);
  const src = new Uint8Array(await doc.save());
  const out = await Ops.buildFromPlan(src, [{ src: 0, rot: 90 }, { src: 1, rot: 270 }, { src: null, rot: 0 }, { src: null, rot: 90, size: [50, 60] }]);
  eq(await rotationsOf(out), [180, 270, 0, 90]);
  eq(await widthsOf(out), [111, 122, 111, 50]);
  // a blank added after a page copies that page's size and turn
  const after = await Ops.buildFromPlan(src, [{ src: 0, rot: 0 }, { src: null, rot: 0, ref: 0 }, { src: null, rot: 0, ref: 1 }]);
  eq(await widthsOf(after), [111, 111, 122]);
  eq(await rotationsOf(after), [90, 90, 0]);
});
test('plan: the source bytes are never modified, and nothing is saved for an empty plan', async () => {
  const src = await makePdf([101, 102]);
  const copy = Uint8Array.from(src);
  await Ops.buildFromPlan(src, [{ src: 1, rot: 90 }]);
  ok(same(src, copy), 'input changed');
  await throwsAsync(() => Ops.buildFromPlan(src, []), /no pages/);
  await throwsAsync(() => Ops.buildFromPlan(src, [{ src: 5, rot: 0 }]), /not in this PDF/);
});
test('plan: title and author carry over, but no producer or dates are added', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]); doc.setTitle('Report'); doc.setAuthor('Ana');
  const out = await Ops.buildFromPlan(new Uint8Array(await doc.save()), [{ src: 0, rot: 0 }]);
  const info = await Ops.docInfo(out);
  eq([info.title, info.author, info.producer, info.created], ['Report', 'Ana', '', null]);
});
test('plan: several outputs from one source match building them one at a time', async () => {
  const src = await makePdf([101, 102, 103, 104, 105]);
  const plans = [[0, 1], [2], [4, 3, 3]].map(l => l.map(i => ({ src: i, rot: 0 })));
  const seen = [];
  const many = await Ops.buildMany(src, plans, (done, total) => seen.push([done, total]));
  eq(await Promise.all(many.map(widthsOf)), [[101, 102], [103], [105, 104, 104]]);
  eq(seen, [[1, 3], [2, 3], [3, 3]]);
});
test('damaged and password-protected files get a plain error', async () => {
  await throwsAsync(() => Ops.buildFromPlan(new Uint8Array(Buffer.from('not a pdf')), [{ src: 0, rot: 0 }]), /could not be read/);
});

// ---------------------------------------------------------------- merge
test('merge: order is the order given, with optional page selections', async () => {
  const a = await makePdf([101, 102, 103]);
  const b = await makePdf([201, 202]);
  eq(await widthsOf(await Ops.merge([{ bytes: a }, { bytes: b }])), [101, 102, 103, 201, 202]);
  eq(await widthsOf(await Ops.merge([{ bytes: b }, { bytes: a, pages: [3, 1] }])), [201, 202, 103, 101]);
  await throwsAsync(() => Ops.merge([{ bytes: a }]), /at least two/);
  await throwsAsync(() => Ops.merge([{ bytes: a }, { bytes: b, pages: [9] }]), /not in this PDF/);
});

// ---------------------------------------------------------------- images to PDF
test('images to PDF: A4, Letter and fit-to-picture page sizes', async () => {
  const jpg = { bytes: new Uint8Array(TINY_JPEG), kind: 'jpg' };
  const wide = { bytes: tinyPng(40, 20), kind: 'png' };
  const sizes = async o => (await PDFDocument.load(await Ops.imagesToPdf([jpg, wide], o))).getPages().map(p => p.getSize()).map(s => [Math.round(s.width), Math.round(s.height)]);
  eq(await sizes({ mode: 'a4' }), [[595, 842], [842, 595]]);
  eq(await sizes({ mode: 'letter' }), [[612, 792], [792, 612]]);
  eq(await sizes({ mode: 'fit', dpi: 72 }), [[1, 1], [40, 20]]);
  await throwsAsync(() => Ops.imagesToPdf([], {}), /at least one/);
});
test('images to PDF: a photo stored sideways becomes a landscape page', async () => {
  const sideways = { bytes: jpegWithOrientation(6, true), kind: 'jpg' };   // tiny 1x1 so shape comes from the turn only
  const doc = await PDFDocument.load(await Ops.imagesToPdf([sideways], { mode: 'fit', dpi: 72 }));
  eq(doc.getPageCount(), 1);
});

// ---------------------------------------------------------------- stamp
// Page content streams are compressed, so decompress them and look for the text as drawn: <hex> Tj
function contentOf(bytes) {
  const zlib = require('zlib');
  const { PDFName: N, PDFArray, PDFRawStream } = PDFLib;
  return PDFDocument.load(bytes, { updateMetadata: false }).then(doc => {
    let all = '';
    for (const page of doc.getPages()) {
      const c = page.node.Contents();
      const list = c instanceof PDFArray ? c.asArray().map(r => doc.context.lookup(r)) : c ? [c] : [];
      for (const s of list) {
        let data = Buffer.from(s.getContents());
        if (s instanceof PDFRawStream && String(s.dict.get(N.of('Filter'))).includes('FlateDecode')) data = zlib.inflateSync(data);
        all += data.toString('latin1') + '\n';
      }
    }
    return all.toUpperCase();
  });
}
function hex(s) { return Buffer.from(s, 'latin1').toString('hex').toUpperCase(); }
const hasIn = (content, s) => content.includes('<' + hex(s) + '>');

test('stamp: page numbers use the real page number, the start offset and the total', async () => {
  const src = await makePdf([101, 102, 103]);
  const out = await Ops.stamp(src, { numbers: { format: 'Page {n} of {total}', start: 5, size: 10, color: '#000000', position: 'bottom-center' } });
  const c = await contentOf(out);
  ok(hasIn(c, 'Page 5 of 3') && hasIn(c, 'Page 6 of 3') && hasIn(c, 'Page 7 of 3'), 'labels missing');
  const some = await contentOf(await Ops.stamp(src, { numbers: { format: '{n}', start: 1, size: 10, color: '#000000', position: 'top-right', pages: [2] } }));
  ok(hasIn(some, '2') && !hasIn(some, '1') && !hasIn(some, '3'), 'only page 2 should be numbered');
  eq(await widthsOf(out), [101, 102, 103]);
});
test('stamp: a watermark too big for the page is shrunk to fit', async () => {
  const src = await makePdf([300]);                          // 300 x 200 page
  const sizeUsed = async o => { const c = await contentOf(await Ops.stamp(src, { watermark: Object.assign({ text: 'CONFIDENTIAL', color: '#000000', opacity: 0.3, angle: 0 }, o) })); return Number((c.match(/([\d.]+) TF/) || [])[1]); };
  ok((await sizeUsed({ size: 300 })) < 60, 'a 300pt word cannot fit a 300pt-wide page');
  eq(await sizeUsed({ size: 12 }), 12);                      // small enough already: unchanged
});
test('stamp: watermark text is drawn and unsupported characters are refused', async () => {
  const src = await makePdf([300]);
  const out = await Ops.stamp(src, { watermark: { text: 'DRAFT', size: 40, color: '#ff0000', opacity: 0.3, angle: 45 } });
  ok(hasIn(await contentOf(out), 'DRAFT'));
  await throwsAsync(() => Ops.stamp(src, { watermark: { text: '你好', size: 40, color: '#000000', opacity: 0.3, angle: 0 } }), /cannot draw/);
  await throwsAsync(() => Ops.stamp(src, { numbers: { format: '{n}', size: 10, color: '#000000', pages: [4] } }), /not in this PDF/);
});

// ---------------------------------------------------------------- geometry: displayed page <-> stored page
test('geometry: view to stored coordinates for every rotation', async () => {
  const doc = await PDFDocument.create();
  const mk = r => { const p = doc.addPage([200, 100]); p.setRotation(degrees(r)); return Ops.geometry(p); };
  // 200 x 100 stored. Displayed: 0 -> 200x100, 90 -> 100x200, 180 -> 200x100, 270 -> 100x200
  const g0 = mk(0), g90 = mk(90), g180 = mk(180), g270 = mk(270);
  eq([g0.W, g0.H, g90.W, g90.H, g270.W, g270.H], [200, 100, 100, 200, 100, 200]);
  eq(Ops.viewToUser(g0, 0, 0), { x: 0, y: 100 });           // top-left shows the stored top-left
  eq(Ops.viewToUser(g0, 200, 100), { x: 200, y: 0 });
  eq(Ops.viewToUser(g90, 0, 0), { x: 0, y: 0 });            // rotated clockwise: stored bottom-left is now top-left
  eq(Ops.viewToUser(g90, 100, 0), { x: 0, y: 100 });        // displayed top-right is stored top-left
  eq(Ops.viewToUser(g180, 0, 0), { x: 200, y: 0 });
  eq(Ops.viewToUser(g270, 0, 0), { x: 200, y: 100 });
  eq(Ops.viewToUser(g270, 100, 0), { x: 200, y: 0 });
});

// ---------------------------------------------------------------- annotate
test('annotate: text, boxes and images are added without changing the page count', async () => {
  const src = await makePdf([300, 300]);
  const out = await Ops.annotate(src, {
    1: [
      { type: 'text', x: 20, y: 30, text: 'Hello\nWorld', size: 14, color: '#112233' },
      { type: 'rect', x: 10, y: 10, w: 100, h: 20, fill: '#ffff00', opacity: 0.4 },
      { type: 'rect', x: 50, y: 60, w: 40, h: 40, stroke: '#ff0000', strokeWidth: 2 },
      { type: 'image', x: 150, y: 150, w: 40, h: 40, bytes: tinyPng(4, 4), kind: 'png' }
    ],
    2: [{ type: 'text', x: 5, y: 5, text: 'Page two', size: 10, color: '#000000', bold: true }]
  });
  eq(await widthsOf(out), [300, 300]);
  const c = await contentOf(out);
  ok(hasIn(c, 'Hello') && hasIn(c, 'World') && hasIn(c, 'Page two'));
  await throwsAsync(() => Ops.annotate(src, { 3: [] }), /not in this PDF/);
  await throwsAsync(() => Ops.annotate(src, { 1: [{ type: 'text', x: 0, y: 0, text: '漢字', size: 10, color: '#000000' }] }), /cannot draw/);
});
test('annotate: works on rotated pages too', async () => {
  const doc = await PDFDocument.create();
  [90, 180, 270].forEach(r => doc.addPage([300, 200]).setRotation(degrees(r)));
  const out = await Ops.annotate(new Uint8Array(await doc.save()), {
    1: [{ type: 'text', x: 10, y: 10, text: 'A', size: 12, color: '#000000' }, { type: 'rect', x: 0, y: 0, w: 50, h: 50, fill: '#000000' }],
    2: [{ type: 'image', x: 10, y: 10, w: 20, h: 20, bytes: tinyPng(2, 2), kind: 'png' }],
    3: [{ type: 'text', x: 10, y: 10, text: 'C', size: 12, color: '#000000' }]
  });
  eq(await rotationsOf(out), [90, 180, 270]);
});

// ---------------------------------------------------------------- crop
test('crop: margins are as displayed, whatever the page rotation', async () => {
  const doc = await PDFDocument.create();
  [0, 90, 180, 270].forEach(r => doc.addPage([400, 200]).setRotation(degrees(r)));
  const src = new Uint8Array(await doc.save());
  const out = await PDFDocument.load(await Ops.crop(src, { top: 10, right: 20, bottom: 30, left: 40 }, null));
  const boxes = out.getPages().map(p => { const b = p.getCropBox(); return [b.x, b.y, b.width, b.height]; });
  // stored box is 400 x 200 at (0,0); displayed margins map onto stored sides according to the rotation
  eq(boxes[0], [40, 30, 340, 160]);     // 0:   left 40, bottom 30, right 20, top 10
  eq(boxes[1], [10, 40, 360, 140]);     // 90:  stored left = top 10, stored bottom = left 40, stored right = bottom 30, stored top = right 20
  eq(boxes[2], [20, 10, 340, 160]);     // 180: stored left = right 20, stored bottom = top 10, stored right = left 40, stored top = bottom 30
  eq(boxes[3], [30, 20, 360, 140]);     // 270: stored left = bottom 30, stored bottom = right 20, stored right = top 10, stored top = left 40
});
test('crop: only the chosen pages, and a crop that leaves nothing is refused', async () => {
  const src = await makePdf([300, 300, 300]);
  const out = await PDFDocument.load(await Ops.crop(src, { top: 50, right: 0, bottom: 0, left: 0 }, [2]));
  eq(out.getPages().map(p => Math.round(p.getCropBox().height)), [200, 150, 200]);
  await throwsAsync(() => Ops.crop(src, { top: 150, right: 0, bottom: 100, left: 0 }, null), /leave nothing/);
});

// ---------------------------------------------------------------- properties
test('properties: set, clear and strip', async () => {
  const src = await makePdf([100], { title: 'Old title' });
  const set = await Ops.setMetadata(src, { title: 'New', author: 'Bo', subject: '', keywords: 'a, b', creator: '', producer: '', created: '2020-01-02T03:04:05Z', modified: '' });
  const i1 = await Ops.docInfo(set);
  eq([i1.title, i1.author, i1.subject, i1.keywords, i1.creator], ['New', 'Bo', '', 'a, b', '']);
  eq(i1.created && i1.created.toISOString(), '2020-01-02T03:04:05.000Z');
  eq(i1.modified, null);
  // XMP metadata stream, as real files often carry
  const d = await PDFDocument.load(set, { updateMetadata: false });
  d.catalog.set(PDFName.of('Metadata'), d.context.register(d.context.stream('<x:xmpmeta/>')));
  const withXmp = new Uint8Array(await d.save());
  eq((await Ops.docInfo(withXmp)).hasXmp, true);
  const clean = await Ops.docInfo(await Ops.stripMetadata(withXmp));
  eq([clean.title, clean.author, clean.keywords, clean.created, clean.hasXmp], ['', '', '', null, false]);
  eq(clean.pages, 1);
});

// ---------------------------------------------------------------- forms
async function formPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  form.createTextField('name').addToPage(page, { x: 10, y: 250, width: 150, height: 20 });
  form.createCheckBox('agree').addToPage(page, { x: 10, y: 220, width: 15, height: 15 });
  const dd = form.createDropdown('color'); dd.addOptions(['Red', 'Green']); dd.addToPage(page, { x: 10, y: 180, width: 100, height: 20 });
  const rg = form.createRadioGroup('size'); rg.addOptionToPage('S', page, { x: 10, y: 150, width: 15, height: 15 }); rg.addOptionToPage('L', page, { x: 40, y: 150, width: 15, height: 15 });
  return new Uint8Array(await doc.save());
}
test('forms: fields are listed, filled and can be flattened', async () => {
  const src = await formPdf();
  const fields = await Ops.formFields(src);
  eq(fields.map(f => [f.name, f.type]), [['name', 'text'], ['agree', 'checkbox'], ['color', 'dropdown'], ['size', 'radio']]);
  const filled = await Ops.fillForm(src, { name: 'Ada', agree: true, color: 'Green', size: 'L' }, false);
  const again = await Ops.formFields(filled);
  eq(again.map(f => f.value), ['Ada', true, 'Green', 'L']);
  const flat = await Ops.formFields(await Ops.fillForm(src, { name: 'Ada' }, true));
  eq(flat.length, 0);
  await throwsAsync(() => Ops.fillForm(src, { name: '日本' }, false), /cannot draw/);
});
test('forms: a PDF without fields gives an empty list', async () => {
  eq(await Ops.formFields(await makePdf([100])), []);
});
