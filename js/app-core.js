/* App core: shared state, the open document, toasts, the busy overlay, drag-and-drop and event delegation.
 * Pages (js/pages/*.js) register themselves with App.register and stay thin: they turn state into HTML.
 * Everything lives in memory. Nothing is written to storage, and nothing is sent anywhere. */
(function (root) {
  'use strict';

  const { esc } = UI;
  const E = Engine;

  // ---------- extra icons (Lucide style, 24x24 strokes) ----------
  Object.assign(UI.ICONS, {
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
    pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    form: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
    filePlus: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="18" y2="12"/><line x1="9" x2="15" y1="15" y2="15"/>',
    pointer: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    rotR: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    rotL: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
  });

  // ---------- tiny helpers ----------
  const $ = s => document.querySelector(s);
  function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((a, k) => a[k], o);
    target[last] = v;
  }

  const handlers = {};
  const App = {
    S: {},
    pages: [],
    acts: {},
    E: E,
    esc: esc,
    getPath: getPath,
    setPath: setPath,
    on: function (name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit: function (name, arg) { (handlers[name] || []).forEach(fn => fn(arg)); },
    register: function (page) { App.pages.push(page); if (page.state) App.S[page.id] = page.state(); },
    page: id => App.pages.filter(p => p.id === id)[0]
  };

  // ---------- messages ----------
  let toastSeq = 0;
  App.toast = function (text, kind) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.id = 'toast' + (++toastSeq);
    el.innerHTML = '<span>' + esc(text) + '</span><button aria-label="Dismiss">' + UI.I('x') + '</button>';
    el.querySelector('button').addEventListener('click', () => el.remove());
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), kind === 'error' ? 9000 : 5000);
  };
  App.fail = function (err) {
    console.error(err);
    const known = err && (err instanceof PdfOps.UserError || /^(This PDF|Those pages|Page |There are no|Add at least|That |Enter |Only |Those )/.test(err.message || ''));
    App.toast(known ? err.message : 'Something went wrong: ' + ((err && err.message) || err), 'error');
  };

  /** Shows a "Working…" overlay while a task runs (only if it takes a moment), and reports any error. */
  App.work = async function (text, fn) {
    const el = document.getElementById('work');
    document.getElementById('workTxt').textContent = text || 'Working…';
    const timer = setTimeout(() => { el.hidden = false; }, 200);
    try { return await fn(); }
    catch (e) { App.fail(e); return undefined; }
    finally { clearTimeout(timer); el.hidden = true; }
  };

  App.save = function (name, data, mime) {
    E.download(name, data, mime);
    App.toast('Saved ' + name + ' (' + E.fmtSize(data.length != null ? data.length : data.size) + ') to your downloads.', 'ok');
  };

  // ---------- the open document ----------
  let verCounter = 0;
  const Doc = {
    cur: null,

    async open(name, bytes) {
      const pdf = await E.openPdf(bytes);
      Doc.dispose();
      Doc.cur = { name: name, bytes: bytes, size: bytes.length, pages: pdf.numPages, pdf: pdf, ver: ++verCounter, thumbs: new Map(), thumbUrls: new Map() };
      UI.setState(true, name + ' · ' + E.plural(pdf.numPages, 'page'));
      App.emit('doc', Doc.cur);
      return Doc.cur;
    },

    /** A tool produced new bytes: keep working on them. */
    async replace(bytes, name) {
      return Doc.open(name || Doc.cur.name, bytes);
    },

    dispose() {
      const c = Doc.cur;
      if (!c) return;
      c.thumbUrls.forEach(u => URL.revokeObjectURL(u));
      E.closePdf(c.pdf);
      Doc.cur = null;
    },

    close() {
      Doc.dispose();
      UI.setState(false, 'No PDF open');
      App.emit('doc', null);
    },

    thumbSrc: n => (Doc.cur && Doc.cur.thumbUrls.get(n)) || '',

    /** Start (once) drawing the thumbnail of page n, and fill in any <img data-thumb="n"> when ready. */
    thumb(n) {
      const c = Doc.cur;
      if (!c || c.thumbs.has(n) || n < 1 || n > c.pages) return;
      const ver = c.ver;
      c.thumbs.set(n, E.thumb(c.pdf, n, 240, 320).then(function (url) {
        if (!Doc.cur || Doc.cur.ver !== ver) { URL.revokeObjectURL(url); return; }
        c.thumbUrls.set(n, url);
        document.querySelectorAll('img[data-thumb="' + n + '"]').forEach(img => { img.src = url; img.classList.add('ready'); });
      }, () => {}));
    },

    /** The HTML for a page thumbnail. Drawn lazily as it scrolls into view. */
    thumbImg(n, extra) {
      const src = Doc.thumbSrc(n);
      return '<img class="thumb' + (src ? ' ready' : '') + '" data-thumb="' + n + '" alt="Page ' + n + '"' + (src ? ' src="' + src + '"' : '') + (extra || '') + '>';
    },

    outName(suffix, ext) {
      return E.safeName(E.stem(Doc.cur.name) + (suffix ? ' - ' + suffix : '')) + '.' + (ext || 'pdf');
    }
  };
  App.Doc = Doc;

  let observer = null;
  function watchThumbs() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        observer.unobserve(en.target);
        Doc.thumb(Number(en.target.dataset.thumb));
      });
    }, { rootMargin: '400px' });
    document.querySelectorAll('img[data-thumb]:not(.ready)').forEach(img => observer.observe(img));
  }

  // ---------- rendering hooks ----------
  UI.onRender(function (id) {
    const p = App.page(id);
    if (p && p.mount) {
      const r = p.mount(document.getElementById('page'));
      if (r && r.catch) r.catch(e => console.error(e));
    }
    watchThumbs();
  });

  /** A card telling the user to open a PDF first. */
  App.needDoc = function () {
    return UI.empty({ icon: 'upload', title: 'Open a PDF first', text: 'This tool works on the PDF you have open. Nothing is uploaded; it stays in this tab.', action: ['Open a PDF', 'open'] });
  };

  // ---------- dropping files anywhere ----------
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
  document.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging'); } });
  document.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const files = Array.from(e.dataTransfer.files);
    const p = App.page(UI.page());
    if (p && p.onFiles) Promise.resolve(p.onFiles(files)).catch(App.fail);
    else App.openFiles(files);
  });

  /** Open the first PDF among the files. */
  App.openFiles = async function (files) {
    const f = files.filter(x => /\.pdf$/i.test(x.name) || x.type === 'application/pdf')[0];
    if (!f) return App.toast('That is not a PDF file.', 'error');
    await App.work('Opening ' + f.name + '…', async function () {
      const doc = await Doc.open(f.name, await E.readBytes(f));
      App.toast('Opened ' + doc.name + ' (' + E.plural(doc.pages, 'page') + ').', 'ok');
      UI.refresh();
    });
  };

  // ---------- event delegation ----------
  document.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act],[data-set]');
    if (!t) return;
    if (t.dataset.set) {
      App.setPath(App.S, t.dataset.set, t.dataset.val);
      return UI.refresh();
    }
    const fn = App.acts[t.dataset.act];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(t, e)).catch(App.fail);
  });
  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.bind) {
      App.setPath(App.S, t.dataset.bind, t.type === 'checkbox' ? t.checked : t.dataset.num != null ? Number(t.value) : t.value);
      if (t.dataset.norefresh == null) UI.refresh();
    }
  });
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (t.dataset && t.dataset.model) App.setPath(App.S, t.dataset.model, t.dataset.num != null ? Number(t.value) : t.value);
  });

  // shared acts
  App.acts['open.pick'] = async function () {
    const files = await E.chooseFiles('application/pdf,.pdf', false);
    if (files.length) await App.openFiles(files);
  };

  root.App = App;
})(window);
