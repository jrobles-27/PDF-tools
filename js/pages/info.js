/* Properties: see and edit a PDF's title, author and other hidden details, or remove them all. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.info;
  const FIELDS = [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Created with'], ['producer', 'Converted by']];

  App.on('doc', function () { const s = S(); s.loaded = false; s.facts = null; s.meta = {}; s.error = ''; });

  const local = d => { if (!d) return ''; const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };

  async function load() {
    const s = S(), ver = Doc.cur.ver;
    try {
      const i = await PdfOps.docInfo(Doc.cur.bytes);
      if (!Doc.cur || Doc.cur.ver !== ver) return;
      s.facts = i;
      s.meta = { title: i.title, author: i.author, subject: i.subject, keywords: i.keywords, creator: i.creator, producer: i.producer, created: local(i.created), modified: local(i.modified) };
      s.error = '';
    } catch (e) { s.error = e.message; }
    s.loaded = true;
    UI.refresh();
  }

  function payload() {
    const m = Object.assign({}, S().meta);
    const iso = v => (v ? new Date(v).toISOString() : '');
    m.created = iso(m.created); m.modified = iso(m.modified);
    return m;
  }

  const A = App.acts;
  A['info.dl'] = () => App.work('Saving…', async function () { App.save(Doc.outName('properties'), await PdfOps.setMetadata(Doc.cur.bytes, payload()), 'application/pdf'); });
  A['info.keep'] = () => App.work('Saving…', async function () {
    await Doc.replace(await PdfOps.setMetadata(Doc.cur.bytes, payload()), Doc.cur.name);
    App.toast('Properties updated. You can keep editing the result.', 'ok');
    UI.refresh();
  });
  A['info.strip'] = () => App.work('Removing details…', async function () { App.save(Doc.outName('no metadata'), await PdfOps.stripMetadata(Doc.cur.bytes), 'application/pdf'); });
  A['info.reset'] = function () { S().loaded = false; UI.refresh(); };

  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    if (!s.loaded) return card('Reading the details…', '', '<p class="hint" style="margin:0">One moment.</p>');
    if (s.error) return card('Could not read this PDF', '', '<p class="hint bad" style="margin:0">' + esc(s.error) + '</p>');
    const f = s.facts;
    const facts = card('About this file', '', '<div class="stat-row"><div><b>' + f.pages + '</b>' + (f.pages === 1 ? 'page' : 'pages') + '</div><div><b>' + E.fmtSize(d.size) + '</b>size</div>' +
      '<div><b>' + Math.round(f.pageWidth) + ' × ' + Math.round(f.pageHeight) + '</b>first page (pt)</div><div><b>' + (f.hasXmp ? 'Yes' : 'No') + '</b>extra XMP metadata</div></div>');
    const edit = card('Properties', 'These are stored inside the file and are often shared with it. Empty a box to remove that detail.',
      '<div class="grid g2">' + FIELDS.map(x => '<div class="field"><label for="in_' + x[0] + '">' + x[1] + '</label><input id="in_' + x[0] + '" class="txt" type="text" data-model="info.meta.' + x[0] + '" value="' + esc(s.meta[x[0]]) + '"></div>').join('') +
      '<div class="field"><label for="in_created">Created</label><input id="in_created" class="txt" type="datetime-local" data-model="info.meta.created" value="' + esc(s.meta.created) + '"></div>' +
      '<div class="field"><label for="in_modified">Last changed</label><input id="in_modified" class="txt" type="datetime-local" data-model="info.meta.modified" value="' + esc(s.meta.modified) + '"></div></div>');
    const save = card('Save', 'Your original file is not changed.',
      '<div class="row wrap" style="gap:8px"><button class="btn primary" data-act="info.dl">' + I('download') + ' Save changes and download</button>' +
      '<button class="btn" data-act="info.keep">' + I('pen') + ' Save and keep editing</button><button class="btn ghost" data-act="info.reset">' + I('reset') + ' Undo my edits</button></div>');
    const privacy = card('Remove all hidden details', 'Strips the title, author, dates, software names and any XMP metadata before you share the file.',
      '<button class="btn" data-act="info.strip">' + I('shield') + ' Remove all metadata and download</button>' +
      '<p class="hint">This does not remove anything visible on the pages, and other hidden things (such as comments or attachments) are not touched.</p>');
    return facts + edit + save + privacy;
  }

  function mount() { if (Doc.cur && !S().loaded) load(); }

  App.register({
    id: 'info', label: 'Properties', icon: 'info', group: 'Edit', order: 65, tone: 'blue',
    sub: 'See and edit title, author and other hidden details, or remove them.',
    blurb: 'Edit the title, author and other details stored in a PDF, or strip them all before sharing.',
    state: () => ({ loaded: false, facts: null, meta: {}, error: '' }),
    render: render, mount: mount
  });
})();
