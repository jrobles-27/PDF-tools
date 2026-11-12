/* Images to PDF: one picture per page. JPEG and PNG go in exactly as they are (no recompression);
 * other formats the browser can read (WebP, GIF, BMP, AVIF) are first turned into PNG, which loses nothing. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.fromimg;
  const isImg = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name);
  const ACCEPT = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif';

  async function addFile(f) {
    const s = S();
    const item = { id: s.nextId++, name: f.name, bytes: null, kind: null, size: f.size, url: '', converted: false, err: '' };
    try {
      let bytes = await E.readBytes(f);
      let kind = E.imageKind(bytes);
      if (!kind) { bytes = await E.imageToPng(f); kind = 'png'; item.converted = true; }
      item.bytes = bytes; item.kind = kind;
      item.url = URL.createObjectURL(new Blob([bytes], { type: kind === 'png' ? 'image/png' : 'image/jpeg' }));
    } catch (e) { item.err = 'This picture could not be read (HEIC photos are not supported by browsers; export them as JPEG first).'; }
    s.items.push(item);
  }

  async function addFiles(files) {
    const pics = files.filter(isImg);
    if (!pics.length) return App.toast('Those are not pictures I can read. JPEG, PNG, WebP, GIF, BMP and AVIF work.', 'error');
    await App.work('Reading your pictures…', async function () { for (const f of pics) await addFile(f); });
    UI.refresh();
  }
  function clear() { S().items.forEach(it => it.url && URL.revokeObjectURL(it.url)); S().items = []; }

  const A = App.acts;
  A['fromimg.pick'] = async function () { addFiles(await E.chooseFiles(ACCEPT, true)); };
  A['fromimg.up'] = function (t) { const s = S(), i = Number(t.dataset.idx); if (i > 0) { [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]]; UI.refresh(); } };
  A['fromimg.down'] = function (t) { const s = S(), i = Number(t.dataset.idx); if (i < s.items.length - 1) { [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]]; UI.refresh(); } };
  A['fromimg.remove'] = function (t) { const s = S(), i = Number(t.dataset.idx); if (s.items[i].url) URL.revokeObjectURL(s.items[i].url); s.items.splice(i, 1); UI.refresh(); };
  A['fromimg.clear'] = function () { clear(); UI.refresh(); };

  const build = () => PdfOps.imagesToPdf(S().items.map(it => ({ bytes: it.bytes, kind: it.kind })), { mode: S().mode, margin: Number(S().margin), dpi: Number(S().dpi) });
  const outName = () => E.safeName(S().name.replace(/\.pdf$/i, '') || 'Pictures') + '.pdf';
  A['fromimg.go'] = () => App.work('Making your PDF…', async function () { App.save(outName(), await build(), 'application/pdf'); });
  A['fromimg.keep'] = () => App.work('Making your PDF…', async function () {
    await Doc.open(outName(), await build());
    App.toast('Done. It is now the open PDF, so you can keep editing it.', 'ok');
    UI.go('organize');
  });

  function render() {
    const s = S();
    const dropBox = '<div class="drop" data-drop="fromimg"><div class="big bg-green c-green">' + I('image') + '</div><h4>Drop pictures here</h4>' +
      '<p>JPEG, PNG, WebP, GIF, BMP or AVIF. Sideways phone photos are turned upright.</p><div class="acts"><button class="btn primary" data-act="fromimg.pick">' + I('image') + ' Choose pictures</button></div></div>';
    if (!s.items.length) return card('Add the pictures', '', dropBox);

    const rows = s.items.map(function (it, i) {
      return '<div class="fl-row"><span class="ord">' + (i + 1) + '</span><div class="fl-thumb">' + (it.url ? '<img src="' + it.url + '" alt="">' : I('image')) + '</div>' +
        '<div class="fl-main"><div class="fl-name" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
        '<div class="fl-meta' + (it.err ? ' bad' : '') + '">' + (it.err ? esc(it.err) : E.fmtSize(it.size) + (it.converted ? ' · will be converted to PNG first (lossless)' : '')) + '</div></div>' +
        '<button class="btn icon ghost sm" data-act="fromimg.up" data-idx="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + I('up') + '</button>' +
        '<button class="btn icon ghost sm" data-act="fromimg.down" data-idx="' + i + '" aria-label="Move down"' + (i === s.items.length - 1 ? ' disabled' : '') + '>' + I('down') + '</button>' +
        '<button class="btn icon ghost sm" data-act="fromimg.remove" data-idx="' + i + '" aria-label="Remove">' + I('x') + '</button></div>';
    }).join('');
    const list = card('Pictures', 'One per page, in this order.', '<div class="fl">' + rows + '</div>', '<button class="btn sm" data-act="fromimg.pick">' + I('plus') + ' Add more</button>');

    const fit = s.mode === 'fit';
    const ok = s.items.filter(i => !i.err);
    const can = ok.length > 0 && ok.length === s.items.length;
    const opts = card('Page and save', 'Pictures are placed as they are, with no recompression.',
      '<div class="row wrap" style="gap:16px;align-items:flex-end">' +
      '<div class="field"><label>Page size</label>' + UI.seg('fromimg.mode', s.mode, [['a4', 'A4'], ['letter', 'US Letter'], ['fit', 'Fit the picture']]) + '</div>' +
      (fit ? '<div class="field"><label>Printed at</label><select data-bind="fromimg.dpi">' + [['96', '96 dpi'], ['150', '150 dpi'], ['300', '300 dpi']].map(x => '<option value="' + x[0] + '"' + (String(s.dpi) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>'
        : '<div class="field"><label>Margin</label><select data-bind="fromimg.margin">' + [['0', 'None'], ['18', 'Small'], ['36', 'Normal']].map(x => '<option value="' + x[0] + '"' + (String(s.margin) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>') +
      '<div class="field grow" style="min-width:220px"><label for="fiName">Name of the PDF</label><input id="fiName" class="txt" type="text" data-model="fromimg.name" value="' + esc(s.name) + '"></div></div>' +
      '<div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" data-act="fromimg.go"' + (can ? '' : ' disabled') + '>' + I('download') + ' Make PDF and download</button>' +
      '<button class="btn" data-act="fromimg.keep"' + (can ? '' : ' disabled') + '>' + I('pen') + ' Make PDF and keep editing</button>' +
      '<button class="btn ghost" data-act="fromimg.clear">' + I('trash') + ' Start over</button></div>');
    return list + opts;
  }

  App.register({
    id: 'fromimg', label: 'Images to PDF', icon: 'filePlus', group: 'Convert', order: 80, tone: 'green',
    sub: 'Put pictures into a PDF, one per page.',
    blurb: 'Put JPEG, PNG and other pictures into a PDF, one per page, without recompressing them.',
    state: () => ({ items: [], nextId: 1, mode: 'a4', margin: '18', dpi: '150', name: 'Pictures' }),
    onFiles: addFiles, render: render
  });
})();
