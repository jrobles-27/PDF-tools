/* Combine PDFs: join several files in the order shown, optionally taking only some pages from each. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.combine;
  const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';

  async function addBytes(name, bytes) {
    const s = S();
    const item = { id: s.nextId++, name: name, bytes: bytes, size: bytes.length, pages: 0, range: '', thumb: '', err: '' };
    try {
      const pdf = await E.openPdf(bytes);
      item.pages = pdf.numPages;
      item.thumb = await E.thumb(pdf, 1, 120, 160);
      E.closePdf(pdf);
    } catch (e) { item.err = e.message; }
    s.items.push(item);
  }

  async function addFiles(files) {
    const pdfs = files.filter(isPdf);
    if (!pdfs.length) return App.toast('Only PDF files can be combined here.', 'error');
    await App.work('Reading your PDFs…', async function () {
      for (const f of pdfs) await addBytes(f.name, await E.readBytes(f));
    });
    UI.refresh();
  }

  function forget(item) { if (item.thumb) URL.revokeObjectURL(item.thumb); }
  function clear() { S().items.forEach(forget); S().items = []; }
  App.on('doc', () => { /* the combine list is independent of the open document */ });

  const A = App.acts;
  A['combine.pick'] = async function () { addFiles(await E.chooseFiles('application/pdf,.pdf', true)); };
  A['combine.addOpen'] = () => App.work('Adding…', async function () { await addBytes(Doc.cur.name, Doc.cur.bytes); UI.refresh(); });
  A['combine.up'] = function (t) { const s = S(), i = Number(t.dataset.idx); if (i > 0) { [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]]; UI.refresh(); } };
  A['combine.down'] = function (t) { const s = S(), i = Number(t.dataset.idx); if (i < s.items.length - 1) { [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]]; UI.refresh(); } };
  A['combine.remove'] = function (t) { const s = S(), i = Number(t.dataset.idx); forget(s.items[i]); s.items.splice(i, 1); UI.refresh(); };
  A['combine.clear'] = function () { clear(); UI.refresh(); };

  async function build() {
    const s = S();
    const inputs = s.items.map(function (it) {
      if (!it.range.trim()) return { bytes: it.bytes };
      const r = Ranges.parse(it.range, it.pages);
      if (!r.ok) throw new PdfOps.UserError(it.name + ': ' + r.error);
      return { bytes: it.bytes, pages: r.pages };
    });
    return PdfOps.merge(inputs);
  }
  const outName = () => E.safeName(S().name.replace(/\.pdf$/i, '') || 'Combined') + '.pdf';

  A['combine.go'] = () => App.work('Combining…', async function () { App.save(outName(), await build(), 'application/pdf'); });
  A['combine.keep'] = () => App.work('Combining…', async function () {
    const bytes = await build();
    await Doc.open(outName(), bytes);
    App.toast('Combined. It is now the open PDF, so you can keep editing it.', 'ok');
    UI.go('organize');
  });

  function render() {
    const s = S(), ok = s.items.filter(i => !i.err);
    const dropBox = '<div class="drop" data-drop="combine"><div class="big bg-violet c-violet">' + I('merge') + '</div><h4>Drop PDFs here</h4>' +
      '<p>Choose two or more. You can add more later and put them in order.</p><div class="acts"><button class="btn primary" data-act="combine.pick">' + I('file') + ' Choose PDFs</button>' +
      (Doc.cur ? '<button class="btn" data-act="combine.addOpen">' + I('plus') + ' Use the open PDF</button>' : '') + '</div></div>';
    if (!s.items.length) return card('Add the PDFs to combine', '', dropBox);

    const rows = s.items.map(function (it, i) {
      return '<div class="fl-row"><span class="ord">' + (i + 1) + '</span>' +
        '<div class="fl-thumb">' + (it.thumb ? '<img src="' + it.thumb + '" alt="">' : I('file')) + '</div>' +
        '<div class="fl-main"><div class="fl-name" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
        '<div class="fl-meta' + (it.err ? ' bad' : '') + '">' + (it.err ? esc(it.err) : E.plural(it.pages, 'page') + ' · ' + E.fmtSize(it.size)) + '</div></div>' +
        '<input class="txt fl-range" data-idx="' + i + '" type="text" spellcheck="false" placeholder="All pages" aria-label="Pages to use from ' + esc(it.name) + '" value="' + esc(it.range) + '"' + (it.err ? ' disabled' : '') + '>' +
        '<button class="btn icon ghost sm" data-act="combine.up" data-idx="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + I('up') + '</button>' +
        '<button class="btn icon ghost sm" data-act="combine.down" data-idx="' + i + '" aria-label="Move down"' + (i === s.items.length - 1 ? ' disabled' : '') + '>' + I('down') + '</button>' +
        '<button class="btn icon ghost sm" data-act="combine.remove" data-idx="' + i + '" aria-label="Remove">' + I('x') + '</button></div>';
    }).join('');
    const total = ok.reduce((n, it) => n + (it.pages || 0), 0);
    const list = card('PDFs to combine', 'They join in this order. Leave “All pages” blank, or type pages like 1-3, 7 to take only those.',
      '<div class="fl">' + rows + '</div>', '<button class="btn sm" data-act="combine.pick">' + I('plus') + ' Add more</button>' +
      (Doc.cur ? '<button class="btn sm ghost" data-act="combine.addOpen">' + I('plus') + ' Use the open PDF</button>' : ''));
    const can = ok.length >= 2 && ok.length === s.items.length;
    const out = card('Save', 'The originals are not changed.',
      '<div class="row wrap" style="gap:10px;align-items:flex-end"><div class="field grow" style="min-width:240px"><label for="cmbName">Name of the new PDF</label>' +
      '<input id="cmbName" class="txt" type="text" data-model="combine.name" value="' + esc(s.name) + '"></div></div>' +
      '<div class="row wrap" style="gap:8px;margin-top:12px"><button class="btn primary" data-act="combine.go"' + (can ? '' : ' disabled') + '>' + I('download') + ' Combine ' + (can ? s.items.length + ' PDFs' : '') + ' and download</button>' +
      '<button class="btn" data-act="combine.keep"' + (can ? '' : ' disabled') + '>' + I('pen') + ' Combine and keep editing</button>' +
      '<button class="btn ghost" data-act="combine.clear">' + I('trash') + ' Start over</button></div>' +
      '<p class="hint">' + (can ? 'About ' + E.plural(total, 'page') + ' in the result (before any page selections).' : s.items.length < 2 ? 'Add at least two PDFs.' : 'Remove the files that could not be read.') + '</p>');
    return list + out;
  }

  function mount(root) {
    root.querySelectorAll('.fl-range').forEach(function (inp) {
      inp.addEventListener('input', () => { S().items[Number(inp.dataset.idx)].range = inp.value; });
    });
  }

  App.register({
    id: 'combine', label: 'Combine PDFs', icon: 'merge', group: 'Pages', order: 20, tone: 'violet',
    sub: 'Join PDFs into one, in the order you choose.',
    blurb: 'Join two or more PDFs into one, in any order, taking all or only some pages of each.',
    state: () => ({ items: [], name: 'Combined', nextId: 1 }),
    onFiles: addFiles, render: render, mount: mount
  });
})();
