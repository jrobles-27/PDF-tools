/* Crop pages: trim margins by a set amount, on all pages or chosen ones, with a live preview of what stays.
 * This hides the outside area but does not delete it from the file. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.crop;
  const UNITS = { mm: 72 / 25.4, in: 72, pt: 1 };
  const SIDES = [['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left']];

  const imgCache = new Map();
  App.on('doc', function () {
    const s = S();
    s.page = 1; s.pages = '';
    imgCache.forEach(u => URL.revokeObjectURL(u)); imgCache.clear();
  });

  const points = () => { const s = S(), k = UNITS[s.unit]; return { top: (Number(s.top) || 0) * k, right: (Number(s.right) || 0) * k, bottom: (Number(s.bottom) || 0) * k, left: (Number(s.left) || 0) * k }; };

  function targets() {
    const s = S();
    if (!s.pages.trim()) return null;
    const r = Ranges.parse(s.pages, Doc.cur.pages);
    if (!r.ok) throw new PdfOps.UserError(r.error);
    return Array.from(new Set(r.pages));
  }
  const A = App.acts;
  A['crop.dl'] = () => App.work('Cropping…', async function () { App.save(Doc.outName('cropped'), await PdfOps.crop(Doc.cur.bytes, points(), targets()), 'application/pdf'); });
  A['crop.keep'] = () => App.work('Cropping…', async function () {
    await Doc.replace(await PdfOps.crop(Doc.cur.bytes, points(), targets()), Doc.cur.name);
    App.toast('Cropped. You can keep editing the result.', 'ok');
    UI.refresh();
  });
  A['crop.prev'] = function () { const s = S(); if (s.page > 1) { s.page--; UI.refresh(); } };
  A['crop.next'] = function () { const s = S(); if (s.page < Doc.cur.pages) { s.page++; UI.refresh(); } };
  A['crop.zero'] = function () { Object.assign(S(), { top: '0', right: '0', bottom: '0', left: '0' }); UI.refresh(); };

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const fields = '<div class="row wrap" style="gap:12px;align-items:flex-end">' + SIDES.map(x =>
      '<div class="field"><label for="crp_' + x[0] + '">' + x[1] + '</label><input id="crp_' + x[0] + '" class="txt num" type="number" min="0" step="any" data-model="crop.' + x[0] + '" value="' + esc(s[x[0]]) + '"></div>').join('') +
      '<div class="field"><label>Unit</label><select data-bind="crop.unit">' + Object.keys(UNITS).map(u => '<option value="' + u + '"' + (s.unit === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
      '<div class="field grow" style="min-width:200px"><label for="crpPages">Pages</label><input id="crpPages" class="txt" type="text" spellcheck="false" data-model="crop.pages" placeholder="All pages  (or for example 2-, 1-4)" value="' + esc(s.pages) + '"></div></div>' +
      '<p class="hint">Margins are measured from each edge of the page as you see it. The preview shows what stays.</p>';
    const nav = '<div class="row" style="gap:6px"><button class="btn icon sm" data-act="crop.prev" aria-label="Previous page"' + (s.page <= 1 ? ' disabled' : '') + '>' + I('chevL') + '</button><span class="hint" style="margin:0">Page <b>' + s.page + '</b> of ' + d.pages + '</span><button class="btn icon sm" data-act="crop.next" aria-label="Next page"' + (s.page >= d.pages ? ' disabled' : '') + '>' + I('chevR') + '</button></div>';
    const stage = '<div class="prev-wrap"><div class="crop-stage" id="crpStage"><img id="crpImg" alt="Page ' + s.page + '"><div class="crop-shade" id="crpShade"><div class="crop-keep" id="crpKeep"></div></div></div></div>';
    return card('Margins to trim', 'Cut the same amount from each edge.', fields, '<button class="btn sm ghost" data-act="crop.zero">Reset</button>') +
      card('Preview', 'The lighter area stays; the dimmed border is cropped away.', stage, nav) +
      card('Apply', 'Your original file is not changed.',
        '<div class="row wrap" style="gap:8px"><button class="btn primary" data-act="crop.dl">' + I('download') + ' Crop and download</button><button class="btn" data-act="crop.keep">' + I('pen') + ' Crop and keep editing</button></div>' +
        '<p class="hint">Cropping hides the outer area but does not delete it from the file. To remove sensitive material for good, delete the page or convert it to a picture.</p>');
  }

  async function mount(root) {
    const d = Doc.cur, s = S();
    if (!d) return;
    const stage = root.querySelector('#crpStage'), img = root.querySelector('#crpImg'), keep = root.querySelector('#crpKeep');
    const page = await d.pdf.getPage(s.page);
    if (!stage.isConnected) return;   // the user moved to another tool while this was loading
    const v = page.getViewport({ scale: 1 });
    const width = Math.min(520, v.width * 1.4);
    stage.style.width = width + 'px'; stage.style.height = width * v.height / v.width + 'px';
    const paint = function () {
      // Read the boxes themselves: this listener runs before the app records the typed value.
      const k = UNITS[s.unit], val = id => (Number(root.querySelector('#crp_' + id).value) || 0) * k;
      const m = { top: val('top'), right: val('right'), bottom: val('bottom'), left: val('left') };
      const l = Math.min(0.95, m.left / v.width), r = Math.min(0.95, m.right / v.width), t = Math.min(0.95, m.top / v.height), b = Math.min(0.95, m.bottom / v.height);
      keep.style.left = l * 100 + '%'; keep.style.right = r * 100 + '%'; keep.style.top = t * 100 + '%'; keep.style.bottom = b * 100 + '%';
    };
    paint();
    root.querySelectorAll('[data-model^="crop."]').forEach(el => el.addEventListener('input', paint));
    const key = d.ver + ':' + s.page;
    if (!imgCache.has(key)) {
      const canvas = document.createElement('canvas');
      await E.render(page, Math.min(2, 560 / v.width * Math.min(2, window.devicePixelRatio || 1)), canvas);
      imgCache.set(key, URL.createObjectURL(await E.toBlob(canvas, 'image/jpeg', 0.9)));
      canvas.width = 0;
    }
    if (img.isConnected) img.src = imgCache.get(key);
  }

  App.register({
    id: 'crop', label: 'Crop pages', icon: 'crop', group: 'Edit', order: 50, tone: 'green',
    sub: 'Trim the margins off pages.',
    blurb: 'Trim margins from every page, or only some, with a preview of what stays.',
    state: () => ({ top: '0', right: '0', bottom: '0', left: '0', unit: 'mm', pages: '', page: 1 }),
    render: render, mount: mount
  });
})();
