/* Annotate and sign: put text, highlights, boxes, white-out, pictures and a drawn signature onto pages.
 * Items are kept in points on the displayed page (origin top-left), exactly what PdfOps.annotate expects,
 * and are only written into the PDF when you save. Everything stays in memory. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const S = () => App.S.annotate;
  const ZOOMS = [['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']];
  const TOOLS = [
    ['select', 'pointer', 'Select and move'], ['text', 'type', 'Text'], ['highlight', 'highlighter', 'Highlight'],
    ['box', 'square', 'Box'], ['whiteout', 'eraser', 'White-out'], ['image', 'image', 'Picture or signature']
  ];

  const dimsCache = new Map();    // "ver:page" -> { w, h }
  const imgCache = new Map();     // "ver:page:zoom" -> blob URL of the drawn page

  App.on('doc', function () {
    const s = S();
    s.items = {}; s.page = 1; s.sel = null; s.pending = null; s.tool = 'select';
    dimsCache.clear();
    imgCache.forEach(u => URL.revokeObjectURL(u));
    imgCache.clear();
  });

  const items = () => { const s = S(); return s.items[s.page] || (s.items[s.page] = []); };
  const byId = id => items().filter(i => i.id === id)[0];
  const total = () => Object.keys(S().items).reduce((n, k) => n + S().items[k].length, 0);

  async function pageDims(n) {
    const key = Doc.cur.ver + ':' + n;
    if (!dimsCache.has(key)) {
      const p = await Doc.cur.pdf.getPage(n);
      const v = p.getViewport({ scale: 1 });
      dimsCache.set(key, { w: v.width, h: v.height });
    }
    return dimsCache.get(key);
  }
  async function pageImage(n, zoom) {
    const key = Doc.cur.ver + ':' + n + ':' + zoom;
    if (!imgCache.has(key)) {
      const page = await Doc.cur.pdf.getPage(n);
      const canvas = document.createElement('canvas');
      await E.render(page, zoom * Math.min(2, window.devicePixelRatio || 1), canvas);
      const blob = await E.toBlob(canvas, 'image/jpeg', 0.92);
      canvas.width = 0;
      imgCache.set(key, URL.createObjectURL(blob));
    }
    return imgCache.get(key);
  }

  // ---------- items ----------
  function newItem(extra) { const s = S(); return Object.assign({ id: s.nextId++ }, extra); }
  function add(it) { items().push(it); S().sel = it.id; return it; }
  function remove(id) { const list = items(), i = list.findIndex(x => x.id === id); if (i >= 0) list.splice(i, 1); if (S().sel === id) S().sel = null; }

  function itemEl(it, zoom) {
    const el = document.createElement('div');
    el.className = 'ov-item ov-' + it.type + (it.kind ? ' ' + it.kind : '');
    el.dataset.id = it.id;
    el.style.left = it.x * zoom + 'px'; el.style.top = it.y * zoom + 'px';
    if (it.type === 'text') {
      el.style.fontSize = it.size * zoom + 'px'; el.style.color = it.color; el.style.fontWeight = it.bold ? '700' : '400';
      el.textContent = it.text || ' ';
    } else {
      el.style.width = it.w * zoom + 'px'; el.style.height = it.h * zoom + 'px';
      const inner = document.createElement(it.type === 'image' ? 'img' : 'div');
      inner.className = 'fill';
      if (it.type === 'image') { inner.src = it.url; inner.alt = ''; inner.draggable = false; inner.style.opacity = it.opacity; }
      else {
        inner.style.opacity = it.opacity;
        if (it.fill) inner.style.background = it.fill;
        if (it.stroke) inner.style.border = Math.max(1, it.strokeWidth * zoom) + 'px solid ' + it.stroke;
      }
      el.appendChild(inner);
      const h = document.createElement('div'); h.className = 'rh'; el.appendChild(h);
    }
    return el;
  }

  // ---------- the stage ----------
  let ctx = null;   // { root, ov, zoom } for the page currently on screen

  function buildOverlay() {
    if (!ctx) return;
    ctx.ov.innerHTML = '';
    items().forEach(it => ctx.ov.appendChild(itemEl(it, ctx.zoom)));
    paintSel();
    updateSave();
  }
  // The Save card shows how many marks there are; keep it right without redrawing the page.
  function updateSave() {
    const n = total(), box = document.getElementById('annCount');
    if (box) box.textContent = n ? E.plural(n, 'mark') + ' added so far.' : 'Nothing added yet.';
    document.querySelectorAll('[data-act="annotate.dl"],[data-act="annotate.keep"],[data-act="annotate.clearall"]').forEach(b => { b.disabled = !n; });
    const page = document.querySelector('[data-act="annotate.clearpage"]');
    if (page) page.disabled = !items().length;
  }
  function paintSel() {
    if (!ctx) return;
    ctx.ov.querySelectorAll('.ov-item').forEach(el => el.classList.toggle('sel', Number(el.dataset.id) === S().sel));
    renderInspector();
  }
  function refreshItem(it) {
    if (!ctx) return;
    const old = ctx.ov.querySelector('.ov-item[data-id="' + it.id + '"]');
    const el = itemEl(it, ctx.zoom);
    if (old) old.replaceWith(el); else ctx.ov.appendChild(el);
    el.classList.toggle('sel', it.id === S().sel);
  }

  function point(e) {
    const r = ctx.ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) / ctx.zoom, y: (e.clientY - r.top) / ctx.zoom };
  }

  function stageEvents(dims) {
    const ov = ctx.ov, zoom = ctx.zoom, s = S();
    ov.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      const target = e.target.closest('.ov-item');
      const p = point(e);
      if (target && s.tool === 'select' || target && e.target.classList.contains('rh')) {
        const it = byId(Number(target.dataset.id));
        s.sel = it.id; paintSel();
        const resizing = e.target.classList.contains('rh');
        const start = { px: e.clientX, py: e.clientY, x: it.x, y: it.y, w: it.w, h: it.h };
        target.setPointerCapture(e.pointerId);
        const move = function (ev) {
          const dx = (ev.clientX - start.px) / zoom, dy = (ev.clientY - start.py) / zoom;
          if (resizing) {
            it.w = Math.max(8, start.w + dx);
            it.h = it.type === 'image' ? it.w * (start.h / start.w) : Math.max(8, start.h + dy);
            target.style.width = it.w * zoom + 'px'; target.style.height = it.h * zoom + 'px';
          } else {
            it.x = start.x + dx; it.y = start.y + dy;
            target.style.left = it.x * zoom + 'px'; target.style.top = it.y * zoom + 'px';
          }
        };
        const up = function () { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); renderInspector(); };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        e.preventDefault();
        return;
      }
      if (target) return;
      if (s.tool === 'select') { s.sel = null; return paintSel(); }
      if (s.tool === 'text') {
        e.preventDefault();   // keep the click from taking focus away from the text box we are about to show
        const it = add(newItem({ type: 'text', x: p.x, y: Math.max(0, p.y - s.size / 2), text: 'Text', size: Number(s.size), color: s.color, bold: false }));
        s.tool = 'select'; s.focusText = true;
        return UI.refresh();
      }
      if (s.tool === 'image') {
        if (!s.pending) return App.toast('Choose or draw a picture first, then click where it goes.', 'info');
        const w = Math.min(180, dims.w * 0.4), h = w / s.pending.aspect;
        add(newItem({ type: 'image', x: Math.max(0, p.x - w / 2), y: Math.max(0, p.y - h / 2), w: w, h: h, bytes: s.pending.bytes, kindImg: s.pending.kind, url: s.pending.url, opacity: 1 }));
        s.tool = 'select';
        return UI.refresh();
      }
      // drag out a rectangle: highlight, box or white-out
      const draft = document.createElement('div');
      draft.className = 'ov-item ov-rect draft ' + s.tool;
      ov.appendChild(draft);
      const x0 = p.x, y0 = p.y;
      ov.setPointerCapture(e.pointerId);
      const rect = ev => { const q = point(ev); return { x: Math.min(x0, q.x), y: Math.min(y0, q.y), w: Math.abs(q.x - x0), h: Math.abs(q.y - y0) }; };
      const move = function (ev) { const r = rect(ev); Object.assign(draft.style, { left: r.x * zoom + 'px', top: r.y * zoom + 'px', width: r.w * zoom + 'px', height: r.h * zoom + 'px' }); };
      const up = function (ev) {
        ov.removeEventListener('pointermove', move); ov.removeEventListener('pointerup', up);
        draft.remove();
        const r = rect(ev);
        if (r.w < 4 || r.h < 4) return;
        const kind = s.tool;
        const base = { type: 'rect', kind: kind, x: r.x, y: r.y, w: r.w, h: r.h };
        if (kind === 'highlight') add(newItem(Object.assign(base, { fill: s.hlColor, stroke: null, strokeWidth: 0, opacity: 0.4 })));
        else if (kind === 'whiteout') add(newItem(Object.assign(base, { fill: '#ffffff', stroke: null, strokeWidth: 0, opacity: 1 })));
        else add(newItem(Object.assign(base, { fill: null, stroke: s.color, strokeWidth: 2, opacity: 1 })));
        buildOverlay();
      };
      ov.addEventListener('pointermove', move);
      ov.addEventListener('pointerup', up);
    });
    ov.addEventListener('dblclick', function (e) {
      const t = e.target.closest('.ov-text');
      if (t) { S().sel = Number(t.dataset.id); paintSel(); const ta = document.getElementById('annText'); if (ta) { ta.focus({ preventScroll: true }); ta.select(); } }
    });
  }

  // ---------- the inspector for the selected item ----------
  function renderInspector() {
    const box = document.getElementById('annInsp');
    if (!box) return;
    const s = S(), it = byId(s.sel);
    if (!it) { box.innerHTML = '<p class="hint" style="margin:0">Click an item on the page to change it. Drag to move it; drag the corner dot to resize.</p>'; return; }
    let h = '<div class="stack">';
    if (it.type === 'text') {
      h += '<div class="field"><label for="annText">Text</label><textarea id="annText" class="txt" rows="3" spellcheck="false">' + esc(it.text) + '</textarea></div>' +
        '<div class="row" style="gap:10px;align-items:flex-end"><div class="field"><label for="annSize">Size</label><input id="annSize" class="txt num" type="number" min="6" max="200" value="' + it.size + '"></div>' +
        '<div class="field"><label for="annColor">Colour</label><input id="annColor" class="color" type="color" value="' + it.color + '"></div>' +
        '<label class="check"><input id="annBold" type="checkbox"' + (it.bold ? ' checked' : '') + '> Bold</label></div>';
    } else if (it.type === 'rect') {
      h += '<div class="row" style="gap:10px;align-items:flex-end">' +
        (it.kind === 'box' ? '<div class="field"><label for="annColor">Outline</label><input id="annColor" class="color" type="color" value="' + (it.stroke || '#e11d48') + '"></div>' +
          '<div class="field"><label for="annW">Thickness</label><input id="annW" class="txt num" type="number" min="1" max="20" value="' + it.strokeWidth + '"></div>'
          : it.kind === 'highlight' ? '<div class="field"><label for="annColor">Colour</label><input id="annColor" class="color" type="color" value="' + it.fill + '"></div>' : '<p class="hint" style="margin:0">Covers what is underneath with white. The covered content stays in the file.</p>') +
        '</div>' + (it.kind !== 'whiteout' ? '<div class="field"><label for="annOp">Opacity</label><input id="annOp" type="range" min="10" max="100" value="' + Math.round(it.opacity * 100) + '"></div>' : '');
    } else {
      h += '<div class="field"><label for="annOp">Opacity</label><input id="annOp" type="range" min="10" max="100" value="' + Math.round(it.opacity * 100) + '"></div>';
    }
    h += '<div><button class="btn sm danger" id="annDel">' + I('trash') + ' Delete this</button></div></div>';
    box.innerHTML = h;
    const $ = id => box.querySelector('#' + id);
    const upd = () => { refreshItem(it); };
    if ($('annText')) $('annText').addEventListener('input', e => { it.text = e.target.value; upd(); });
    if ($('annSize')) $('annSize').addEventListener('input', e => { it.size = Math.max(6, Number(e.target.value) || 12); upd(); });
    if ($('annBold')) $('annBold').addEventListener('change', e => { it.bold = e.target.checked; upd(); });
    if ($('annColor')) $('annColor').addEventListener('input', e => { if (it.type === 'text') it.color = e.target.value; else if (it.kind === 'highlight') it.fill = e.target.value; else it.stroke = e.target.value; upd(); });
    if ($('annW')) $('annW').addEventListener('input', e => { it.strokeWidth = Math.max(1, Number(e.target.value) || 1); upd(); });
    if ($('annOp')) $('annOp').addEventListener('input', e => { it.opacity = Number(e.target.value) / 100; upd(); });
    $('annDel').addEventListener('click', () => { remove(it.id); buildOverlay(); });
  }

  // ---------- signature pad ----------
  function padSetup(root) {
    const c = root.querySelector('#sigPad');
    if (!c) return;
    const dpr = 2;
    c.width = 340 * dpr; c.height = 120 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111827';
    const s = S();
    let down = false, last = null;
    const pos = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * 340 / r.width, y: (e.clientY - r.top) * 120 / r.height }; };
    c.addEventListener('pointerdown', e => { down = true; last = pos(e); c.setPointerCapture(e.pointerId); s.pad = s.pad || { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9, drawn: false }; });
    c.addEventListener('pointermove', function (e) {
      if (!down) return;
      const p = pos(e);
      g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke();
      const pad = s.pad; pad.drawn = true;
      pad.minX = Math.min(pad.minX, p.x, last.x); pad.minY = Math.min(pad.minY, p.y, last.y); pad.maxX = Math.max(pad.maxX, p.x, last.x); pad.maxY = Math.max(pad.maxY, p.y, last.y);
      last = p;
    });
    const end = () => { down = false; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    root.querySelector('#sigClear').addEventListener('click', () => { g.clearRect(0, 0, 340, 120); s.pad = null; });
    root.querySelector('#sigUse').addEventListener('click', async function () {
      const pad = s.pad;
      if (!pad || !pad.drawn) return App.toast('Draw your signature in the box first.', 'info');
      const m = 6, x = Math.max(0, pad.minX - m), y = Math.max(0, pad.minY - m), w = Math.min(340, pad.maxX + m) - x, h = Math.min(120, pad.maxY + m) - y;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * dpr)); out.height = Math.max(1, Math.round(h * dpr));
      out.getContext('2d').drawImage(c, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, out.width, out.height);
      const blob = await E.toBlob(out, 'image/png');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      useImage(bytes, 'png', w / h, URL.createObjectURL(blob), true);
    });
  }

  function useImage(bytes, kind, aspect, url, remember) {
    const s = S();
    const pend = { bytes: bytes, kind: kind, aspect: aspect, url: url, id: s.nextId++ };
    if (remember) s.sigs.push(pend);
    s.pending = pend; s.tool = 'image';
    App.toast('Now click on the page where it should go.', 'info');
    UI.refresh();
  }

  const A = App.acts;
  A['annotate.tool'] = function (t) { S().tool = t.dataset.tool; UI.refresh(); };
  A['annotate.prev'] = function () { const s = S(); if (s.page > 1) { s.page--; s.sel = null; UI.refresh(); } };
  A['annotate.next'] = function () { const s = S(); if (s.page < Doc.cur.pages) { s.page++; s.sel = null; UI.refresh(); } };
  A['annotate.pick'] = async function () {
    const f = (await E.chooseFiles('image/png,image/jpeg,.png,.jpg,.jpeg', false))[0];
    if (!f) return;
    const bytes = await E.readBytes(f), kind = E.imageKind(bytes);
    if (!kind) return App.toast('Only JPEG and PNG pictures can be placed here.', 'error');
    const bmp = await createImageBitmap(f);
    const aspect = bmp.width / bmp.height; bmp.close();
    useImage(bytes, kind, aspect, URL.createObjectURL(new Blob([bytes], { type: kind === 'png' ? 'image/png' : 'image/jpeg' })), true);
  };
  A['annotate.usesig'] = function (t) { const s = S(); s.pending = s.sigs.filter(x => x.id === Number(t.dataset.id))[0]; s.tool = 'image'; UI.refresh(); };
  A['annotate.clearpage'] = function () { S().items[S().page] = []; S().sel = null; UI.refresh(); };
  A['annotate.clearall'] = function () { S().items = {}; S().sel = null; UI.refresh(); };

  function toOps() {
    const byPage = {};
    Object.keys(S().items).forEach(function (k) {
      const list = S().items[k].map(function (it) {
        if (it.type === 'text') return { type: 'text', x: it.x, y: it.y, text: it.text, size: it.size, color: it.color, bold: it.bold };
        if (it.type === 'image') return { type: 'image', x: it.x, y: it.y, w: it.w, h: it.h, bytes: it.bytes, kind: it.kindImg, opacity: it.opacity };
        return { type: 'rect', x: it.x, y: it.y, w: it.w, h: it.h, fill: it.fill, stroke: it.stroke, strokeWidth: it.strokeWidth, opacity: it.opacity };
      }).filter(it => it.type !== 'text' || String(it.text).trim());
      if (list.length) byPage[k] = list;
    });
    return byPage;
  }
  A['annotate.dl'] = () => App.work('Adding your marks…', async function () {
    if (!total()) return App.toast('Add something to a page first.', 'info');
    App.save(Doc.outName('annotated'), await PdfOps.annotate(Doc.cur.bytes, toOps()), 'application/pdf');
  });
  A['annotate.keep'] = () => App.work('Adding your marks…', async function () {
    if (!total()) return App.toast('Add something to a page first.', 'info');
    const bytes = await PdfOps.annotate(Doc.cur.bytes, toOps());
    await Doc.replace(bytes, Doc.cur.name);
    App.toast('Marks added to the PDF. You can keep editing it.', 'ok');
    UI.refresh();
  });

  // ---------- page ----------
  function render() {
    const d = Doc.cur, s = S();
    if (!d) return App.needDoc();
    const tools = '<div class="seg">' + TOOLS.map(t => '<button class="' + (s.tool === t[0] ? 'on' : '') + '" data-act="annotate.tool" data-tool="' + t[0] + '" title="' + t[2] + '" aria-label="' + t[2] + '">' + I(t[1]) + '</button>').join('') + '</div>';
    const nav = '<div class="row" style="gap:6px"><button class="btn icon sm" data-act="annotate.prev" aria-label="Previous page"' + (s.page <= 1 ? ' disabled' : '') + '>' + I('chevL') + '</button>' +
      '<span class="hint" style="margin:0">Page <b>' + s.page + '</b> of ' + d.pages + '</span>' +
      '<button class="btn icon sm" data-act="annotate.next" aria-label="Next page"' + (s.page >= d.pages ? ' disabled' : '') + '>' + I('chevR') + '</button>' +
      '<select data-bind="annotate.zoom" aria-label="Zoom">' + ZOOMS.map(z => '<option value="' + z[0] + '"' + (String(s.zoom) === z[0] ? ' selected' : '') + '>' + z[1] + '</option>').join('') + '</select></div>';
    const hint = { select: 'Click an item to select it. Drag to move.', text: 'Click on the page where the text should go.', highlight: 'Drag over the text to highlight.', box: 'Drag to draw a box.', whiteout: 'Drag to cover something with white.', image: s.pending ? 'Click on the page where the picture should go.' : 'Choose or draw a picture on the right first.' }[s.tool];
    const main = card('Page ' + s.page, hint, '<div class="stage-wrap"><div class="stage tool-' + s.tool + '" id="annStage"><img id="annImg" alt="Page ' + s.page + '"><div class="ov" id="annOv"></div></div></div>', tools + nav);

    const defaults = '<div class="row" style="gap:12px;align-items:flex-end"><div class="field"><label for="annDefColor">Colour</label><input id="annDefColor" class="color" type="color" data-bind="annotate.color" data-norefresh value="' + esc(s.color) + '"></div>' +
      '<div class="field"><label for="annDefSize">Text size</label><input id="annDefSize" class="txt num" type="number" min="6" max="200" data-bind="annotate.size" data-num data-norefresh value="' + esc(s.size) + '"></div>' +
      '<div class="field"><label for="annHl">Highlighter</label><input id="annHl" class="color" type="color" data-bind="annotate.hlColor" data-norefresh value="' + esc(s.hlColor) + '"></div></div>';
    const sel = card('Selected item', '', '<div id="annInsp"></div>');
    const sigs = s.sigs.length ? '<div class="row wrap" style="gap:8px;margin-top:10px">' + s.sigs.map(x => '<button class="sig-chip" data-act="annotate.usesig" data-id="' + x.id + '" title="Use this again"><img src="' + x.url + '" alt="Saved picture"></button>').join('') + '</div>' : '';
    const sig = card('Signature and pictures', 'Draw your signature, or add a picture, then click the page to place it. Kept only until you close this tab.',
      '<canvas id="sigPad" class="sig-pad" aria-label="Draw your signature here"></canvas>' +
      '<div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm primary" id="sigUse">' + I('pen') + ' Use this signature</button><button class="btn sm" id="sigClear">Clear</button><button class="btn sm" data-act="annotate.pick">' + I('image') + ' Add a picture…</button></div>' + sigs);
    const save = card('Save', '<span id="annCount">' + (total() ? E.plural(total(), 'mark') + ' added so far.' : 'Nothing added yet.') + '</span>',
      '<div class="stack"><button class="btn primary" data-act="annotate.dl"' + (total() ? '' : ' disabled') + '>' + I('download') + ' Add marks and download</button>' +
      '<button class="btn" data-act="annotate.keep"' + (total() ? '' : ' disabled') + '>' + I('pen') + ' Add marks and keep editing</button>' +
      '<div class="row" style="gap:6px"><button class="btn sm ghost" data-act="annotate.clearpage"' + (items().length ? '' : ' disabled') + '>Clear this page</button><button class="btn sm ghost" data-act="annotate.clearall"' + (total() ? '' : ' disabled') + '>Clear all</button></div>' +
      '<p class="hint" style="margin:0">Text uses a standard font (Western European letters). White-out hides but does not remove what is underneath.</p></div>');
    return '<div class="grid g-main ann">' + main + '<div class="stack">' + card('Defaults', 'For new items.', defaults) + sel + sig + save + '</div></div>';
  }

  function mount(root) {
    const d = Doc.cur, s = S();
    if (!d) return;
    padSetup(root);
    const stage = root.querySelector('#annStage'), img = root.querySelector('#annImg'), ov = root.querySelector('#annOv');
    if (!stage) return;
    const zoom = Number(s.zoom);
    renderInspector();
    pageDims(s.page).then(async function (dims) {
      if (!stage.isConnected) return;
      stage.style.width = dims.w * zoom + 'px'; stage.style.height = dims.h * zoom + 'px';
      ctx = { root: root, ov: ov, zoom: zoom };
      buildOverlay();
      stageEvents(dims);
      if (s.focusText) { s.focusText = false; setTimeout(function () { const ta = document.getElementById('annText'); if (ta) { ta.focus({ preventScroll: true }); ta.select(); } }, 60); }
      const url = await pageImage(s.page, zoom);
      if (img.isConnected) img.src = url;
    });
  }

  document.addEventListener('keydown', function (e) {
    if (UI.page() !== 'annotate' || !Doc.cur || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const s = S(), it = byId(s.sel);
    if (!it) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(it.id); buildOverlay(); }
    else if (/^Arrow/.test(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') it.x -= step; else if (e.key === 'ArrowRight') it.x += step; else if (e.key === 'ArrowUp') it.y -= step; else it.y += step;
      refreshItem(it);
    }
  });

  App.register({
    id: 'annotate', label: 'Annotate & sign', icon: 'pen', group: 'Edit', order: 30, tone: 'rose',
    sub: 'Add text, highlights, boxes, pictures and your signature to any page.',
    blurb: 'Write on pages, highlight, draw boxes, white-out, and place a drawn signature or picture.',
    state: () => ({ page: 1, tool: 'select', zoom: '1', items: {}, sel: null, nextId: 1, pending: null, sigs: [], color: '#111827', size: 14, hlColor: '#ffe14d', focusText: false, pad: null }),
    render: render, mount: mount
  });
})();
