/* Fill forms: type into the fillable fields of a PDF form, tick boxes, choose from lists. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc } = App;
  const S = () => App.S.forms;

  App.on('doc', function () { const s = S(); s.loaded = false; s.fields = []; s.values = {}; s.error = ''; });

  async function load() {
    const s = S(), ver = Doc.cur.ver;
    try {
      const fields = await PdfOps.formFields(Doc.cur.bytes);
      if (!Doc.cur || Doc.cur.ver !== ver) return;
      s.fields = fields; s.values = {};
      fields.forEach(f => { s.values[f.name] = f.value; });
      s.error = '';
    } catch (e) { s.fields = []; s.error = e.message; }
    s.loaded = true;
    UI.refresh();
  }

  function build() { return PdfOps.fillForm(Doc.cur.bytes, S().values, S().flatten); }
  const A = App.acts;
  A['forms.dl'] = () => App.work('Filling the form…', async function () { App.save(Doc.outName('filled'), await build(), 'application/pdf'); });
  A['forms.keep'] = () => App.work('Filling the form…', async function () {
    await Doc.replace(await build(), Doc.cur.name);
    App.toast('Filled in. You can keep editing the result.', 'ok');
    UI.refresh();
  });

  function control(f, i) {
    const id = 'ff' + i, dis = f.readOnly ? ' disabled' : '';
    const v = S().values[f.name];
    if (f.type === 'checkbox') return '<label class="check"><input id="' + id + '" type="checkbox" data-fname="' + esc(f.name) + '"' + (v ? ' checked' : '') + dis + '> ' + esc(f.name) + '</label>';
    let input;
    if (f.type === 'text') input = '<input id="' + id + '" class="txt" type="text" data-fname="' + esc(f.name) + '" value="' + esc(v) + '"' + dis + '>';
    else input = '<select id="' + id + '" data-fname="' + esc(f.name) + '"' + dis + '><option value="">(none)</option>' + f.options.map(o => '<option value="' + esc(o) + '"' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    return '<div class="field"><label for="' + id + '">' + esc(f.name) + (f.type === 'radio' ? ' (choose one)' : '') + '</label>' + input + '</div>';
  }

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    if (!s.loaded) return card('Looking for form fields…', '', '<p class="hint" style="margin:0">One moment.</p>');
    if (s.error) return card('Could not read the form', '', '<p class="hint bad" style="margin:0">' + esc(s.error) + '</p>');
    if (!s.fields.length) return card('This PDF has no fillable fields', '', '<p class="hint" style="margin:0">Fillable forms have boxes you can click and type into. Many PDFs are just printed pages. To write on any PDF, use <a href="#/annotate" data-go="annotate">Annotate &amp; sign</a> instead.</p>');
    const form = card('Fields', E_plural(s.fields.length) + ' found. Fill in what you need.', '<div class="grid g2 formgrid">' + s.fields.map(control).join('') + '</div>');
    const save = card('Save', 'Your original file is not changed.',
      '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-bind="forms.flatten" data-norefresh' + (s.flatten ? ' checked' : '') + '> Make the answers permanent (the fields can no longer be edited)</label>' +
      '<div class="row wrap" style="gap:8px"><button class="btn primary" data-act="forms.dl">' + I('download') + ' Fill and download</button><button class="btn" data-act="forms.keep">' + I('pen') + ' Fill and keep editing</button></div>' +
      '<p class="hint">Text uses a standard font, so Western European letters work but other scripts do not.</p>');
    return form + save;
  }
  const E_plural = n => n + ' field' + (n === 1 ? '' : 's');

  function mount(root) {
    if (!Doc.cur) return;
    const s = S();
    if (!s.loaded) { load(); return; }
    root.querySelectorAll('[data-fname]').forEach(function (el) {
      const set = () => { s.values[el.dataset.fname] = el.type === 'checkbox' ? el.checked : el.value; };
      el.addEventListener('input', set); el.addEventListener('change', set);
    });
  }

  App.register({
    id: 'forms', label: 'Fill forms', icon: 'form', group: 'Edit', order: 60, tone: 'violet',
    sub: 'Fill in the fields of a fillable PDF form.',
    blurb: 'Type into the fields of a fillable PDF form, tick boxes, and optionally make the answers permanent.',
    state: () => ({ loaded: false, fields: [], values: {}, error: '', flatten: false }),
    render: render, mount: mount
  });
})();
