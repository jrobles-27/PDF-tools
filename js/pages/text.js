/* Extract text: copy all the text out of a PDF, page by page. (No OCR: scanned pages have no text to copy.) */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.text;

  App.on('doc', () => { const s = S(); s.out = ''; s.chars = 0; s.pages = ''; });

  App.acts['text.go'] = async function () {
    const s = S(), d = Doc.cur;
    let pages = Array.from({ length: d.pages }, (_, i) => i + 1);
    if (s.pages.trim()) {
      const r = Ranges.parse(s.pages, d.pages);
      if (!r.ok) throw new PdfOps.UserError(r.error);
      pages = Array.from(new Set(r.pages));
    }
    await App.work('Reading the text…', async function () {
      const work = document.getElementById('workTxt');
      const parts = []; let chars = 0;
      for (let k = 0; k < pages.length; k++) {
        work.textContent = 'Reading page ' + pages[k] + ' (' + (k + 1) + ' of ' + pages.length + ')…';
        const t = await E.pageText(d.pdf, pages[k]);
        chars += t.length;
        parts.push('--- Page ' + pages[k] + ' ---\n' + t + '\n');
      }
      s.out = chars ? parts.join('\n') : '';
      s.chars = chars;
      s.empty = !chars;
    });
    UI.refresh();
  };
  App.acts['text.dl'] = function () { App.save(Doc.outName('text', 'txt'), new TextEncoder().encode(S().out), 'text/plain;charset=utf-8'); };
  App.acts['text.copy'] = async function () {
    try { await navigator.clipboard.writeText(S().out); App.toast('Copied the text.', 'ok'); }
    catch (e) { App.toast('Your browser did not allow copying. Select the text and press Ctrl+C instead.', 'error'); }
  };

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const setup = card('Extract text', 'Gets the text a PDF actually contains. Scanned pages are pictures of text and have none to copy.',
      '<div class="row wrap" style="gap:12px;align-items:flex-end"><div class="field grow" style="min-width:220px"><label for="txPages">Pages</label>' +
      '<input id="txPages" class="txt" type="text" spellcheck="false" data-model="text.pages" placeholder="All pages  (or for example 1-4, 8-9)" value="' + esc(s.pages) + '"></div>' +
      '<button class="btn primary" data-act="text.go">' + I('type') + ' Extract text</button></div>');
    if (s.empty) return setup + card('No text found', '', '<p class="hint" style="margin:0">This PDF looks like scanned pictures, so there is no text to copy. Copying it would need text recognition (OCR), which this site does not do.</p>');
    if (!s.out) return setup;
    const out = card('Result', E.plural(s.chars, 'character') + ' extracted.',
      '<textarea class="txt out" readonly spellcheck="false" aria-label="Extracted text">' + esc(s.out.length > 300000 ? s.out.slice(0, 300000) + '\n\n… (preview shortened; download for everything)' : s.out) + '</textarea>' +
      '<div class="row" style="gap:8px;margin-top:12px"><button class="btn primary" data-act="text.dl">' + I('download') + ' Download .txt</button><button class="btn" data-act="text.copy">' + I('copy') + ' Copy all</button></div>');
    return setup + out;
  }

  App.register({
    id: 'text', label: 'Extract text', icon: 'type', group: 'Convert', order: 90, tone: 'green',
    sub: 'Copy all the text out of a PDF.',
    blurb: 'Copy all the text out of a PDF into a .txt file, with a marker for each page.',
    state: () => ({ pages: '', out: '', chars: 0, empty: false }),
    render: render
  });
})();
