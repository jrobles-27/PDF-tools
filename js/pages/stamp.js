/* Page numbers and watermark: stamp numbers and/or a text watermark on chosen pages, with a preview. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.stamp;
  const POS = [['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-center', 'Top centre'], ['top-right', 'Top right'], ['top-left', 'Top left']];
  const FORMATS = [['{n}', '1, 2, 3'], ['Page {n}', 'Page 1'], ['Page {n} of {total}', 'Page 1 of 10'], ['{n} / {total}', '1 / 10'], ['- {n} -', '- 1 -']];

  App.on('doc', function () { const s = S(); if (s.preview) URL.revokeObjectURL(s.preview); s.preview = ''; s.nPages = ''; s.wPages = ''; });

  function pagesOf(text) {
    if (!text.trim()) return null;
    const r = Ranges.parse(text, Doc.cur.pages);
    if (!r.ok) throw new PdfOps.UserError(r.error);
    return Array.from(new Set(r.pages));
  }
  function opts() {
    const s = S(), o = {};
    if (s.useNum) o.numbers = { format: s.nFormat, start: Math.floor(Number(s.nStart) || 1), size: Math.min(72, Math.max(6, Number(s.nSize) || 11)), color: s.nColor, position: s.nPos, margin: Math.max(0, Number(s.nMargin) || 0), pages: pagesOf(s.nPages) };
    if (s.useWm && s.wText.trim()) o.watermark = { text: s.wText, size: Math.min(300, Math.max(8, Number(s.wSize) || 72)), color: s.wColor, opacity: Math.min(1, Math.max(0.05, Number(s.wOpacity) || 0.25)), angle: Number(s.wAngle) || 0, pages: pagesOf(s.wPages) };
    if (!o.numbers && !o.watermark) throw new PdfOps.UserError('Turn on page numbers or a watermark (and type the watermark text) first.');
    return o;
  }
  const label = () => { const s = S(); return [s.useNum ? 'numbered' : '', s.useWm && s.wText.trim() ? 'watermarked' : ''].filter(Boolean).join(' and ') || 'stamped'; };

  const A = App.acts;
  A['stamp.preview'] = () => App.work('Drawing the preview…', async function () {
    const o = opts(), s = S();
    const target = (o.numbers && o.numbers.pages && o.numbers.pages[0]) || (o.watermark && o.watermark.pages && o.watermark.pages[0]) || 1;
    const bytes = await PdfOps.stamp(Doc.cur.bytes, o);
    const pdf = await E.openPdf(bytes);
    try {
      const page = await pdf.getPage(target);
      const nat = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      await E.render(page, Math.min(2, 560 / nat.width * Math.min(2, window.devicePixelRatio || 1)), canvas);
      if (s.preview) URL.revokeObjectURL(s.preview);
      s.preview = URL.createObjectURL(await E.toBlob(canvas, 'image/jpeg', 0.9));
      s.previewPage = target;
      canvas.width = 0;
    } finally { E.closePdf(pdf); }
    UI.refresh();
  });
  A['stamp.dl'] = () => App.work('Stamping your PDF…', async function () { App.save(Doc.outName(label()), await PdfOps.stamp(Doc.cur.bytes, opts()), 'application/pdf'); });
  A['stamp.keep'] = () => App.work('Stamping your PDF…', async function () {
    const bytes = await PdfOps.stamp(Doc.cur.bytes, opts());
    await Doc.replace(bytes, Doc.cur.name);
    App.toast('Done. You can keep editing the result.', 'ok');
    UI.refresh();
  });

  function sel(path, cur, list, label) {
    return '<div class="field"><label>' + label + '</label><select data-bind="' + path + '">' + list.map(x => '<option value="' + esc(x[0]) + '"' + (cur === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join('') + '</select></div>';
  }
  const num = (path, v, label, extra) => '<div class="field"><label>' + label + '</label><input class="txt num" type="number" data-model="' + path + '" value="' + esc(v) + '" ' + (extra || '') + '></div>';
  const col = (path, v, label) => '<div class="field"><label>' + label + '</label><input class="color" type="color" data-model="' + path + '" value="' + esc(v) + '"></div>';
  const pagesBox = (path, v) => '<div class="field grow" style="min-width:200px"><label>Pages</label><input class="txt" type="text" spellcheck="false" data-model="' + path + '" placeholder="All pages  (or for example 2-, 1-4)" value="' + esc(v) + '"></div>';

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const numbers = card('Page numbers', 'Adds a number to each page.',
      '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-bind="stamp.useNum"' + (s.useNum ? ' checked' : '') + '> Add page numbers</label>' +
      (s.useNum ? '<div class="row wrap" style="gap:12px;align-items:flex-end">' + sel('stamp.nFormat', s.nFormat, FORMATS, 'Style') + sel('stamp.nPos', s.nPos, POS, 'Position') +
        num('stamp.nStart', s.nStart, 'First number', 'min="0"') + num('stamp.nSize', s.nSize, 'Size', 'min="6" max="72"') + col('stamp.nColor', s.nColor, 'Colour') + num('stamp.nMargin', s.nMargin, 'Edge gap', 'min="0"') + pagesBox('stamp.nPages', s.nPages) + '</div>' : ''));
    const wm = card('Text watermark', 'A large faded word across the page, like DRAFT or CONFIDENTIAL.',
      '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-bind="stamp.useWm"' + (s.useWm ? ' checked' : '') + '> Add a watermark</label>' +
      (s.useWm ? '<div class="row wrap" style="gap:12px;align-items:flex-end"><div class="field grow" style="min-width:200px"><label>Text</label><input class="txt" type="text" data-model="stamp.wText" maxlength="60" placeholder="DRAFT" value="' + esc(s.wText) + '"></div>' +
        num('stamp.wSize', s.wSize, 'Size', 'min="8" max="300"') + num('stamp.wAngle', s.wAngle, 'Angle (°)', 'min="-90" max="90"') + col('stamp.wColor', s.wColor, 'Colour') +
        num('stamp.wOpacity', s.wOpacity, 'Opacity (0.05–1)', 'min="0.05" max="1" step="0.05"') + pagesBox('stamp.wPages', s.wPages) + '</div>' : ''));
    const prev = s.preview ? card('Preview', 'Page ' + s.previewPage + ' with your settings. Nothing is saved yet.', '<div class="prev-wrap"><img class="prev" src="' + s.preview + '" alt="Preview of page ' + s.previewPage + '"></div>') : '';
    const actions = card('Apply', 'Your original file is not changed.',
      '<div class="row wrap" style="gap:8px"><button class="btn" data-act="stamp.preview">' + I('eye') + ' Preview</button>' +
      '<button class="btn primary" data-act="stamp.dl">' + I('download') + ' Apply and download</button>' +
      '<button class="btn" data-act="stamp.keep">' + I('pen') + ' Apply and keep editing</button></div>' +
      '<p class="hint">Text uses a standard font, so Western European letters work but other scripts do not. A watermark covers the page without removing anything.</p>');
    return numbers + wm + prev + actions;
  }

  App.register({
    id: 'stamp', label: 'Numbers & watermark', icon: 'hash', group: 'Edit', order: 40, tone: 'amber',
    sub: 'Add page numbers or a text watermark.',
    blurb: 'Add page numbers in the style and place you choose, or a faded text watermark like DRAFT.',
    state: () => ({ useNum: true, nFormat: 'Page {n} of {total}', nStart: '1', nSize: '11', nColor: '#374151', nPos: 'bottom-center', nMargin: '28', nPages: '', useWm: false, wText: '', wSize: '90', wColor: '#9ca3af', wOpacity: '0.3', wAngle: '45', wPages: '', preview: '', previewPage: 1 }),
    render: render
  });
})();
