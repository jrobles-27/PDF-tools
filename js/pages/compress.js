/* Compress: make the open PDF smaller. A lossless tidy-up always; pictures can optionally be shrunk too. */
(function () {
  'use strict';
  const { I, esc, card, note } = UI;
  const { Doc, E } = App;
  const S = () => App.S.compress;

  const LEVELS = [
    ['lossless', 'Lossless', 'Nothing visible changes. Packs the file more tightly. Often only a small saving.'],
    ['balanced', 'Balanced', 'Photos are shrunk to at most 2000 pixels on the long side at good quality. Fine for screens and most printing.'],
    ['strong', 'Smallest', 'Photos are shrunk to at most 1400 pixels at lower quality. Best for email; fine detail will soften.']
  ];

  App.on('doc', function () { const s = S(); s.result = null; s.running = false; });

  const A = App.acts;
  A['compress.run'] = async function () {
    const s = S(), d = Doc.cur, ver = d.ver;
    const bar = document.getElementById('workTxt');
    s.result = null;
    await App.work('Making it smaller…', async function () {
      const r = await Compress.compress(d.bytes, {
        level: s.level, codec: E.jpegCodec, qpdf: E.qpdf(),
        onProgress: (n, total) => { if (bar) bar.textContent = 'Shrinking picture ' + (n + 1) + ' of ' + total + '…'; }
      });
      if (!Doc.cur || Doc.cur.ver !== ver) return;
      s.result = r;
      s.resultLevel = s.level;
    });
    UI.refresh();
  };
  A['compress.dl'] = function () {
    const r = S().result;
    if (r) App.save(Doc.outName('smaller'), r.bytes, 'application/pdf');
  };
  A['compress.keep'] = () => App.work('Opening the smaller file…', async function () {
    const r = S().result;
    await Doc.replace(r.bytes, Doc.cur.name);
    App.toast('Now working on the smaller version.', 'ok');
    UI.refresh();
  });

  function resultCard() {
    const r = S().result;
    if (!r) return '';
    if (!r.smaller) {
      return card('Already compact', 'This PDF could not be made smaller at this setting.',
        '<p class="hint" style="margin:0">' + (S().resultLevel === 'lossless'
          ? 'It is already packed well. Try Balanced or Smallest to also shrink its pictures' + (r.images ? '.' : ' (there are no pictures in this file, so most of its size is text and fonts).')
          : r.images ? 'Its pictures are already small or in a form this tool leaves alone, so nothing was changed.' : 'There are no pictures in this file, so there is nothing big to shrink.') + ' Nothing was changed, and your file is exactly as you gave it.</p>');
    }
    const pct = Math.max(1, Math.round((1 - r.after / r.before) * 100));
    const pics = r.images ? (r.shrunk ? E.plural(r.shrunk, 'picture') + ' of ' + r.images + ' shrunk' : 'no pictures changed') : 'no pictures in this file';
    return card('Done: ' + pct + '% smaller', 'Your original file is not changed.',
      '<div class="stat-row"><div><b>' + E.fmtSize(r.before) + '</b>before</div><div><b>' + E.fmtSize(r.after) + '</b>after</div><div><b>' + pct + '%</b>saved</div><div><b>' + esc(pics) + '</b>pictures</div></div>' +
      '<div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" data-act="compress.dl">' + I('download') + ' Download the smaller PDF</button>' +
      '<button class="btn" data-act="compress.keep">' + I('pen') + ' Keep editing this version</button></div>' +
      (S().resultLevel === 'lossless' ? '' : '<p class="hint">Pictures that would not shrink clearly are left exactly as they were. Check the result before replacing the original.</p>'));
  }

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const choose = card('How small?', 'Pick a setting, then compress. You can try them one after another; your original is never changed.',
      '<div class="field"><label>Setting</label>' + UI.seg('compress.level', s.level, LEVELS.map(l => [l[0], l[1]])) + '</div>' +
      '<p class="hint" style="margin-top:10px"><b>' + esc(LEVELS.filter(l => l[0] === s.level)[0][1]) + ':</b> ' + esc(LEVELS.filter(l => l[0] === s.level)[0][2]) + '</p>' +
      '<div class="row wrap" style="gap:8px;margin-top:14px"><button class="btn primary" data-act="compress.run">' + I('shrink') + ' Compress</button>' +
      '<span class="hint" style="margin:0">Currently ' + E.fmtSize(d.size) + '.</span></div>');
    const honest = note('<b>What this can and cannot do.</b> It shrinks pictures stored as JPEG (most photos and scans) and packs the rest of the file. Text, fonts and pictures in other formats are kept as they are, so a PDF that is mostly text may not shrink much. Everything happens in this tab; nothing is uploaded.', 'info');
    return choose + resultCard() + honest;
  }

  App.register({
    id: 'compress', label: 'Compress', icon: 'shrink', group: 'Share', order: 66, tone: 'green',
    sub: 'Make a PDF smaller to email or upload.',
    blurb: 'Make a PDF smaller for email or uploads: a lossless tidy-up, or shrink its photos too.',
    state: () => ({ level: 'balanced', result: null, resultLevel: 'balanced' }),
    render: render
  });
})();
