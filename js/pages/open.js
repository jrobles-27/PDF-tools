/* Open: choose a PDF (or a sample), see what is loaded, and jump to any tool. */
(function () {
  'use strict';
  const { I, esc, card, note } = UI;
  const { Doc, E } = App;

  /** A small made-up PDF so people can try every tool without using one of their own files. */
  async function samplePdf() {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const body = await doc.embedFont(StandardFonts.Helvetica);
    const topics = ['Introduction', 'Getting started', 'How it works', 'Examples', 'Tips and tricks', 'Troubleshooting', 'Summary', 'Credits'];
    topics.forEach(function (t, i) {
      const landscape = i === 3;
      const page = doc.addPage(landscape ? [842, 595] : [595, 842]);
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 0, y: 0, width: width, height: height, color: rgb(0.97, 0.98, 1) });
      page.drawRectangle({ x: 0, y: height - 90, width: width, height: 90, color: rgb(0.23, 0.42, 0.96) });
      page.drawText('Sample document', { x: 40, y: height - 52, size: 26, font: font, color: rgb(1, 1, 1) });
      page.drawText(String(i + 1), { x: width - 90, y: height - 62, size: 44, font: font, color: rgb(1, 1, 1) });
      page.drawText(t, { x: 40, y: height - 150, size: 22, font: font, color: rgb(0.1, 0.1, 0.15) });
      for (let l = 0; l < 9; l++) {
        page.drawText('This is sample text for page ' + (i + 1) + '. Line ' + (l + 1) + ' of the page, so there is something to read.', { x: 40, y: height - 200 - l * 22, size: 12, font: body, color: rgb(0.25, 0.27, 0.32) });
      }
    });
    doc.setTitle('Sample document');
    return new Uint8Array(await doc.save());
  }

  App.acts['open.sample'] = async function () {
    await App.work('Making a sample PDF…', async function () {
      await Doc.open('Sample document.pdf', await samplePdf());
      App.toast('Opened a sample PDF with 8 pages.', 'ok');
      UI.refresh();
    });
  };
  App.acts['open.close'] = function () { Doc.close(); UI.refresh(); };

  function tiles() {
    const tools = App.pages.filter(p => p.blurb).sort((a, b) => a.order - b.order);
    return '<div class="grid g3 tiles">' + tools.map(function (p) {
      return '<button class="card tile" data-go="' + p.id + '"><div class="chip bg-' + (p.tone || 'blue') + ' c-' + (p.tone || 'blue') + '">' + I(p.icon) + '</div>' +
        '<h3>' + esc(p.label) + '</h3><p>' + esc(p.blurb) + '</p></button>';
    }).join('') + '</div>';
  }

  App.register({
    id: 'open', label: 'Open a PDF', icon: 'upload', group: 'Start', order: 0,
    sub: 'Open a PDF here once, then use any tool on it.',
    onFiles: files => App.openFiles(files),

    render: function () {
      const d = Doc.cur;
      const privacy = note('<b>Your files never leave this tab.</b> Everything happens inside your browser: nothing is uploaded, nothing is stored, and closing or refreshing the page erases it all. <a href="#/privacy" data-go="privacy">How to check this yourself</a>.');
      const drop = '<div class="drop" data-drop="open"><div class="big bg-blue c-blue">' + I('upload') + '</div>' +
        '<h4>' + (d ? 'Open a different PDF' : 'Drop a PDF here') + '</h4><p>Or choose one from your computer. You can also drop a file anywhere on this page.</p>' +
        '<div class="acts"><button class="btn primary" data-act="open.pick">' + I('file') + ' Choose a PDF</button>' +
        '<button class="btn" data-act="open.sample">' + I('check') + ' Try a sample PDF</button></div></div>';
      const summary = d ? card('Open now', 'Held in this tab’s memory only.',
        '<div class="stat-row"><div><b>' + esc(d.name) + '</b>file</div><div><b>' + d.pages + '</b>' + (d.pages === 1 ? 'page' : 'pages') + '</div>' +
        '<div><b>' + E.fmtSize(d.size) + '</b>size</div><div><b id="openPageSize">…</b>first page</div></div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" data-go="organize">' + I('grid') + ' Organize pages</button>' +
        '<button class="btn" data-act="open.close">' + I('trash') + ' Close this PDF</button></div>') : '';
      return privacy + card('Choose your file', '', '<div style="padding-top:2px">' + drop + '</div>') + summary +
        '<div class="page-head" style="margin-top:8px"><h1 style="font-size:18px">What you can do</h1></div>' + tiles();
    },

    mount: function () {
      const d = Doc.cur;
      const el = document.getElementById('openPageSize');
      if (!d || !el) return;
      d.pdf.getPage(1).then(function (p) {
        const v = p.getViewport({ scale: 1 });
        const mm = (v.width / 72 * 25.4), hh = (v.height / 72 * 25.4);
        const near = (a, b) => Math.abs(a - b) < 3;
        const name = near(mm, 210) && near(hh, 297) ? 'A4 · ' : near(mm, 215.9) && near(hh, 279.4) ? 'Letter · ' : '';
        el.textContent = name + Math.round(v.width) + ' × ' + Math.round(v.height) + ' pt';
      });
    }
  });
})();
