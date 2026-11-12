/* PDF to images: PNG (lossless), JPEG or WebP at a chosen resolution. Several pages arrive as one ZIP. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.toimg;
  const FORMATS = { png: { label: 'PNG (lossless)', mime: 'image/png', ext: 'png', lossy: false }, jpg: { label: 'JPEG', mime: 'image/jpeg', ext: 'jpg', lossy: true }, webp: { label: 'WebP', mime: 'image/webp', ext: 'webp', lossy: true } };
  const DPIS = [[72, '72 dpi · screen'], [150, '150 dpi · reading'], [200, '200 dpi'], [300, '300 dpi · print'], [600, '600 dpi · very large']];
  const LIMIT = 1.5 * 1024 * 1024 * 1024;

  App.on('doc', () => { S().pages = ''; S().running = false; });

  App.acts['toimg.stop'] = function () { S().cancel = true; };
  App.acts['toimg.go'] = async function () {
    const s = S(), d = Doc.cur, f = FORMATS[s.fmt], dpi = Number(s.dpi);
    let pages = Array.from({ length: d.pages }, (_, i) => i + 1);
    if (s.pages.trim()) {
      const r = Ranges.parse(s.pages, d.pages);
      if (!r.ok) throw new PdfOps.UserError(r.error);
      pages = Array.from(new Set(r.pages));
    }
    const go = document.getElementById('imgGo'), stop = document.getElementById('imgStop'), prog = document.getElementById('imgProg'), bar = document.getElementById('imgBar'), txt = document.getElementById('imgTxt');
    go.disabled = true; stop.hidden = false; prog.hidden = false; s.running = true; s.cancel = false;
    const canvas = document.createElement('canvas');
    const width = String(d.pages).length;
    const entries = [];
    let bytes = 0, capped = false;
    try {
      for (let k = 0; k < pages.length; k++) {
        if (s.cancel) break;
        const n = pages[k];
        txt.textContent = 'Drawing page ' + n + ' (' + (k + 1) + ' of ' + pages.length + ')…';
        bar.style.width = (k / pages.length * 100) + '%';
        const page = await d.pdf.getPage(n);
        const info = await E.render(page, dpi / 72, canvas);
        capped = capped || info.capped;
        const blob = await E.toBlob(canvas, f.mime, f.lossy ? Number(s.quality) / 100 : undefined);
        page.cleanup();
        bytes += blob.size;
        if (bytes > LIMIT) throw new PdfOps.UserError('Those pictures add up to more than your browser can hold at once. Try fewer pages or a lower resolution.');
        entries.push({ name: E.safeName(E.stem(d.name)) + ' - page ' + String(n).padStart(width, '0') + '.' + f.ext, data: blob });
        await new Promise(r => setTimeout(r, 0));
      }
      bar.style.width = '100%';
      if (!entries.length) return App.toast('Stopped before any page was drawn.', 'info');
      if (capped) App.toast('Some pages were too large for that resolution and were drawn a little smaller.', 'info');
      if (entries.length === 1) App.save(entries[0].name, entries[0].data);
      else {
        txt.textContent = 'Making the ZIP…';
        const names = E.uniqueNames(entries.map(x => x.name));
        const zip = await Zip.build(entries.map((x, i) => ({ name: names[i], data: x.data })));
        App.save(E.safeName(E.stem(d.name)) + ' - images.zip', zip, 'application/zip');
        if (s.cancel) App.toast('Stopped early: the ZIP has the ' + entries.length + ' pages drawn so far.', 'info');
      }
    } finally {
      canvas.width = 0;
      go.disabled = false; stop.hidden = true; prog.hidden = true; s.running = false;
    }
  };

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const f = FORMATS[s.fmt];
    const opts = card('Convert pages to pictures', 'PNG keeps every pixel. JPEG and WebP are smaller. For the sharpest result choose PNG at 300 dpi.',
      '<div class="row wrap" style="gap:16px;align-items:flex-end">' +
      '<div class="field"><label>Picture format</label>' + UI.seg('toimg.fmt', s.fmt, Object.keys(FORMATS).map(k => [k, FORMATS[k].label])) + '</div>' +
      '<div class="field"><label>Resolution</label><select data-bind="toimg.dpi">' + DPIS.map(x => '<option value="' + x[0] + '"' + (String(s.dpi) === String(x[0]) ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>' +
      (f.lossy ? '<div class="field"><label for="imgQ">Quality <b id="imgQv">' + esc(s.quality) + '</b></label><input id="imgQ" type="range" min="50" max="100" step="1" data-model="toimg.quality" value="' + esc(s.quality) + '"></div>' : '') +
      '<div class="field grow" style="min-width:220px"><label for="imgPages">Pages</label><input id="imgPages" class="txt" type="text" spellcheck="false" data-model="toimg.pages" placeholder="All pages  (or for example 1-4, 8-9)" value="' + esc(s.pages) + '"></div></div>' +
      '<p class="hint" id="imgSize">Each picture will be about … pixels.</p>' +
      '<div id="imgProg" class="progress" hidden><div class="bar-track"><div id="imgBar" class="bar-fill"></div></div><div class="hint" id="imgTxt"></div></div>' +
      '<div class="row" style="gap:8px;margin-top:14px"><button id="imgGo" class="btn primary" data-act="toimg.go">' + I('download') + ' Convert and download</button>' +
      '<button id="imgStop" class="btn" data-act="toimg.stop" hidden>Stop</button></div>');
    return opts;
  }

  function mount(root) {
    const d = Doc.cur;
    if (!d) return;
    const q = root.querySelector('#imgQ'), qv = root.querySelector('#imgQv');
    if (q) q.addEventListener('input', () => { qv.textContent = q.value; });
    const note = root.querySelector('#imgSize');
    d.pdf.getPage(1).then(function (p) {
      const v = p.getViewport({ scale: 1 }), dpi = Number(S().dpi);
      note.textContent = 'Each picture will be about ' + Math.round(v.width * dpi / 72) + ' × ' + Math.round(v.height * dpi / 72) + ' pixels (the first page).';
    });
  }

  App.register({
    id: 'toimg', label: 'PDF to images', icon: 'image', group: 'Convert', order: 70, tone: 'amber',
    sub: 'Turn pages into PNG, JPEG or WebP pictures.',
    blurb: 'Turn pages into sharp PNG, JPEG or WebP pictures at up to 600 dpi, as a ZIP.',
    state: () => ({ fmt: 'png', dpi: '300', quality: '92', pages: '', running: false, cancel: false }),
    render: render, mount: mount
  });
})();
