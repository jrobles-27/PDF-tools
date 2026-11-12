/* Organize pages: choose pages by range or by clicking, then reorder, rotate, delete, duplicate, add blanks,
 * and save as one PDF, only the selection, or split into many files. Edits are a plan applied to the original
 * bytes on save, so nothing is lost until you save. */
(function () {
  'use strict';
  const { I, esc, card } = UI;
  const { Doc, E } = App;
  const O = () => App.S.organize;

  function reset() {
    const o = O(), d = Doc.cur;
    o.plan = d ? Array.from({ length: d.pages }, (_, i) => ({ id: i + 1, src: i, rot: 0 })) : [];
    o.nextId = d ? d.pages + 1 : 1;
    o.sel = []; o.hist = []; o.fut = []; o.range = ''; o.rangeErr = ''; o.dragId = null;
  }
  App.on('doc', reset);

  // ---------- history ----------
  const snap = () => JSON.stringify({ plan: O().plan, sel: O().sel, nextId: O().nextId });
  function push() { const o = O(); o.hist.push(snap()); if (o.hist.length > 60) o.hist.shift(); o.fut = []; }
  function restore(s) { const o = O(), v = JSON.parse(s); o.plan = v.plan; o.sel = v.sel; o.nextId = v.nextId; syncRange(); }
  function syncRange() {
    const o = O(), sel = new Set(o.sel);
    o.range = Ranges.compress(o.plan.map((p, i) => (sel.has(p.id) ? i + 1 : 0)).filter(Boolean));
    o.rangeErr = '';
  }
  const selected = () => { const s = new Set(O().sel); return O().plan.filter(p => s.has(p.id)); };

  function select(ids) { O().sel = Array.from(new Set(ids)); syncRange(); }
  function changed() { syncRange(); UI.refresh(); }

  // ---------- acts ----------
  const A = App.acts;
  A['organize.all'] = () => { select(O().plan.map(p => p.id)); UI.refresh(); };
  A['organize.none'] = () => { select([]); UI.refresh(); };
  A['organize.invert'] = () => { const s = new Set(O().sel); select(O().plan.filter(p => !s.has(p.id)).map(p => p.id)); UI.refresh(); };
  A['organize.odd'] = () => { select(O().plan.filter((p, i) => i % 2 === 0).map(p => p.id)); UI.refresh(); };
  A['organize.even'] = () => { select(O().plan.filter((p, i) => i % 2 === 1).map(p => p.id)); UI.refresh(); };

  function rotate(delta) {
    const o = O(); if (!o.sel.length) return;
    push();
    const s = new Set(o.sel);
    o.plan.forEach(p => { if (s.has(p.id)) p.rot = (((p.rot + delta) % 360) + 360) % 360; });
    UI.refresh();
  }
  A['organize.rotL'] = () => rotate(-90);
  A['organize.rotR'] = () => rotate(90);
  A['organize.del'] = function () {
    const o = O(); if (!o.sel.length) return;
    if (o.sel.length >= o.plan.length) return App.toast('That would delete every page. Keep at least one.', 'error');
    push();
    const s = new Set(o.sel);
    o.plan = o.plan.filter(p => !s.has(p.id));
    o.sel = [];
    changed();
  };
  A['organize.dup'] = function () {
    const o = O(); if (!o.sel.length) return;
    push();
    const s = new Set(o.sel), next = [];
    o.plan.forEach(p => { next.push(p); if (s.has(p.id)) next.push({ id: o.nextId++, src: p.src, rot: p.rot }); });
    o.plan = next;
    changed();
  };
  A['organize.blank'] = function () {
    const o = O();
    push();
    const s = new Set(o.sel);
    let at = o.plan.length;
    o.plan.forEach((p, i) => { if (s.has(p.id)) at = i + 1; });
    const ref = o.plan.slice(0, Math.max(at, 1)).reverse().filter(p => p.src != null)[0];
    const blank = { id: o.nextId++, src: null, rot: 0, ref: ref ? ref.src : 0 };
    o.plan.splice(at, 0, blank);
    o.sel = [blank.id];
    changed();
  };
  function nudge(dir) {
    const o = O(); if (!o.sel.length) return;
    const s = new Set(o.sel), p = o.plan;
    const idx = p.map((x, i) => (s.has(x.id) ? i : -1)).filter(i => i >= 0);
    if (dir < 0 ? idx[0] === 0 : idx[idx.length - 1] === p.length - 1) return;
    push();
    const order = dir < 0 ? idx : idx.slice().reverse();
    order.forEach(i => { const t = i + dir; if (!s.has(p[t].id)) { const tmp = p[t]; p[t] = p[i]; p[i] = tmp; } });
    changed();
  }
  A['organize.earlier'] = () => nudge(-1);
  A['organize.later'] = () => nudge(1);
  A['organize.undo'] = function () { const o = O(); if (!o.hist.length) return; o.fut.push(snap()); restore(o.hist.pop()); UI.refresh(); };
  A['organize.redo'] = function () { const o = O(); if (!o.fut.length) return; o.hist.push(snap()); restore(o.fut.pop()); UI.refresh(); };
  A['organize.reset'] = function () { push(); const o = O(), keepHist = o.hist; reset(); o.hist = keepHist; UI.refresh(); };

  // ---------- saving ----------
  const toPlan = list => list.map(p => (p.src == null ? { src: null, rot: p.rot, ref: p.ref } : { src: p.src, rot: p.rot }));
  const origNumbers = list => list.filter(p => p.src != null).map(p => p.src + 1);
  const label = list => { const n = origNumbers(list); return n.length ? Ranges.compress(n) : 'blank'; };

  A['organize.dlAll'] = () => App.work('Building your PDF…', async function () {
    const bytes = await PdfOps.buildFromPlan(Doc.cur.bytes, toPlan(O().plan));
    App.save(Doc.outName('edited'), bytes, 'application/pdf');
  });
  A['organize.dlSel'] = () => App.work('Building your PDF…', async function () {
    const list = selected(); if (!list.length) return App.toast('Select some pages first.', 'error');
    const bytes = await PdfOps.buildFromPlan(Doc.cur.bytes, toPlan(list));
    App.save(Doc.outName('pages ' + label(list)), bytes, 'application/pdf');
  });
  A['organize.dlWithout'] = () => App.work('Building your PDF…', async function () {
    const s = new Set(O().sel), list = O().plan.filter(p => !s.has(p.id));
    if (!s.size) return App.toast('Select the pages you want to remove first.', 'error');
    if (!list.length) return App.toast('That would remove every page.', 'error');
    const bytes = await PdfOps.buildFromPlan(Doc.cur.bytes, toPlan(list));
    App.save(Doc.outName('without pages ' + label(selected())), bytes, 'application/pdf');
  });
  A['organize.keep'] = () => App.work('Applying your changes…', async function () {
    const bytes = await PdfOps.buildFromPlan(Doc.cur.bytes, toPlan(O().plan));
    await Doc.replace(bytes, Doc.cur.name);
    App.toast('Changes applied. You can keep editing, or use another tool on the result.', 'ok');
    UI.refresh();
  });

  A['organize.split'] = () => App.work('Splitting…', async function () {
    const o = O(), plan = o.plan, mode = o.splitMode;
    let groups = [];   // { name, entries }
    const width = String(plan.length).length;
    if (mode === 'page') {
      groups = plan.map((p, i) => ({ name: 'page ' + String(i + 1).padStart(width, '0'), entries: [p] }));
    } else if (mode === 'every') {
      const n = Math.max(1, Math.floor(Number(o.splitN) || 1));
      for (let i = 0; i < plan.length; i += n) {
        const slice = plan.slice(i, i + n);
        groups.push({ name: 'part ' + String(groups.length + 1).padStart(2, '0') + ' (pages ' + (i + 1) + (slice.length > 1 ? '-' + (i + slice.length) : '') + ')', entries: slice });
      }
    } else {
      const r = Ranges.parse(o.range, plan.length);
      if (!r.ok) throw new PdfOps.UserError(r.error);
      groups = r.groups.map(g => ({ name: 'pages ' + g.label, entries: g.pages.map(n => plan[n - 1]) }));
    }
    if (!groups.length) throw new PdfOps.UserError('There is nothing to split.');
    const work = document.getElementById('workTxt');
    const outs = await PdfOps.buildMany(Doc.cur.bytes, groups.map(g => toPlan(g.entries)), (done, total) => { work.textContent = 'Splitting… ' + done + ' of ' + total; });
    if (outs.length === 1) return App.save(Doc.outName(groups[0].name), outs[0], 'application/pdf');
    const names = E.uniqueNames(groups.map(g => E.safeName(E.stem(Doc.cur.name) + ' - ' + g.name) + '.pdf'));
    work.textContent = 'Making the ZIP…';
    const zip = await Zip.build(outs.map((b, i) => ({ name: names[i], data: b })));
    App.save(E.safeName(E.stem(Doc.cur.name) + ' - split') + '.zip', zip, 'application/zip');
  });

  // ---------- page ----------
  function pageCard(p, i, selSet) {
    const sideways = p.rot === 90 || p.rot === 270;
    const inner = p.src == null ? '<div class="blank">Blank page</div>' : Doc.thumbImg(p.src + 1);
    const turn = p.rot ? ' style="transform:rotate(' + p.rot + 'deg)' + (sideways ? ' scale(.75)' : '') + '"' : '';
    return '<div class="pg' + (selSet.has(p.id) ? ' sel' : '') + '" draggable="true" data-i="' + i + '" data-id="' + p.id + '" role="button" tabindex="0" aria-label="Page ' + (i + 1) + '">' +
      '<div class="pg-thumb"><div class="pg-inner"' + turn + '>' + inner + '</div></div>' +
      '<div class="pg-meta"><b>' + (i + 1) + '</b>' + (p.src != null && p.src !== i ? '<span>was ' + (p.src + 1) + '</span>' : '') + (p.rot ? '<span class="rt">' + I('rotR') + p.rot + '°</span>' : '') + '</div></div>';
  }

  function render() {
    const d = Doc.cur, o = O();
    if (!d) return App.needDoc();
    const sel = new Set(o.sel), n = o.sel.length, need = n ? '' : ' disabled';
    const btn = (act, icon, text, dis, cls) => '<button class="btn sm ' + (cls || '') + '" data-act="organize.' + act + '"' + (dis ? ' disabled' : '') + ' title="' + esc(text) + '">' + I(icon) + '<span>' + esc(text) + '</span></button>';

    const choose = card('Choose pages', 'Type a range, or click pages below (Shift-click selects a stretch).',
      '<div class="row wrap"><div class="field grow" style="min-width:260px"><label for="orgRange">Pages</label>' +
      '<input id="orgRange" class="txt" type="text" spellcheck="false" autocomplete="off" placeholder="For example 1-4, 8-9   (also 5-, last, all)" value="' + esc(o.range) + '"></div>' +
      '<div class="row wrap" style="align-items:flex-end;gap:6px">' + btn('all', 'check', 'All', false, 'ghost') + btn('none', 'x', 'None', false, 'ghost') + btn('invert', 'reset', 'Invert', false, 'ghost') +
      btn('odd', 'hash', 'Odd', false, 'ghost') + btn('even', 'hash', 'Even', false, 'ghost') + '</div></div>' +
      '<div id="orgInfo" class="hint' + (o.rangeErr ? ' bad' : '') + '">' + infoText() + '</div>');

    const edit = card('Edit', 'Changes apply to the selected pages. Nothing is saved until you download.',
      '<div class="row wrap" style="gap:6px">' +
      '<span data-needs-sel class="row" style="gap:6px">' + btn('rotL', 'rotL', 'Turn left', !n) + btn('rotR', 'rotR', 'Turn right', !n) + btn('earlier', 'left', 'Move earlier', !n) + btn('later', 'chevR', 'Move later', !n) +
      btn('dup', 'copy', 'Duplicate', !n) + btn('del', 'trash', 'Delete', !n, 'danger') + '</span>' +
      btn('blank', 'filePlus', 'Add blank page', false) +
      '<span class="sep" style="height:22px"></span>' + btn('undo', 'undo', 'Undo', !o.hist.length, 'ghost') + btn('redo', 'redo', 'Redo', !o.fut.length, 'ghost') + btn('reset', 'reset', 'Reset all', !o.hist.length, 'ghost') + '</div>');

    const grid = card('Pages', '<span id="orgCount">' + countText() + '</span> Drag a page to move it.',
      '<div class="pg-grid" id="orgGrid">' + o.plan.map((p, i) => pageCard(p, i, sel)).join('') + '</div>');

    const split = '<div class="row wrap" style="gap:10px;align-items:flex-end">' +
      '<div class="field"><label>Split into</label><select data-bind="organize.splitMode">' +
      [['page', 'One file per page'], ['every', 'Files of N pages'], ['ranges', 'One file per range above']].map(x => '<option value="' + x[0] + '"' + (o.splitMode === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>' +
      (o.splitMode === 'every' ? '<div class="field"><label for="orgN">Pages per file</label><input id="orgN" class="txt num" type="number" min="1" data-model="organize.splitN" data-num value="' + esc(o.splitN) + '"></div>' : '') +
      '<button class="btn" data-act="organize.split">' + I('scissors') + ' Split and download</button></div>' +
      '<p class="hint">Several files arrive as one ZIP. “One file per range” uses the box above, so <b>1-4, 8-9</b> makes two files.</p>';

    const saveCard = card('Save', 'Your original file is never changed.',
      '<div class="row wrap" style="gap:8px">' +
      '<button class="btn primary" data-act="organize.dlAll">' + I('download') + ' Download all ' + o.plan.length + ' pages</button>' +
      '<button class="btn" data-act="organize.dlSel"' + need + ' data-needs-sel>' + I('download') + ' <span id="orgSelLbl">' + selLabel() + '</span></button>' +
      '<button class="btn" data-act="organize.dlWithout"' + need + ' data-needs-sel>' + I('trash') + ' Download without the selection</button>' +
      '<button class="btn ghost" data-act="organize.keep" title="Apply the edits and keep working on the result in other tools">' + I('pen') + ' Apply and keep editing</button></div>' +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">' + split + '</div>');

    return choose + edit + grid + saveCard;
  }

  const countText = () => E.plural(O().plan.length, 'page') + ' · ' + O().sel.length + ' selected.';
  const selLabel = () => 'Download ' + (O().sel.length ? E.plural(O().sel.length, 'selected page') : 'selected pages');
  function infoText() {
    const o = O();
    if (o.rangeErr) return esc(o.rangeErr);
    if (!o.sel.length) return 'Nothing selected yet.';
    return E.plural(o.sel.length, 'page') + ' selected: ' + esc(o.range) + '.';
  }

  // Selection changes repaint in place, so typing in the range box keeps its focus.
  function paint() {
    const o = O(), sel = new Set(o.sel);
    document.querySelectorAll('#orgGrid .pg').forEach(el => el.classList.toggle('sel', sel.has(Number(el.dataset.id))));
    const info = document.getElementById('orgInfo');
    if (info) { info.innerHTML = infoText(); info.classList.toggle('bad', !!o.rangeErr); }
    const cnt = document.getElementById('orgCount'); if (cnt) cnt.textContent = countText();
    const lbl = document.getElementById('orgSelLbl'); if (lbl) lbl.textContent = selLabel();
    document.querySelectorAll('[data-needs-sel]').forEach(el => {
      const dis = !o.sel.length;
      if (el.tagName === 'BUTTON') el.disabled = dis; else el.querySelectorAll('button').forEach(b => { b.disabled = dis; });
    });
  }

  function moveBlock(dragId, targetIndex, after) {
    const o = O(), s = new Set(o.sel.includes(dragId) ? o.sel : [dragId]);
    const moving = o.plan.filter(p => s.has(p.id));
    const rest = o.plan.filter(p => !s.has(p.id));
    const anchor = o.plan[targetIndex];
    if (s.has(anchor.id)) return;
    push();
    let at = rest.findIndex(p => p.id === anchor.id);
    if (after) at++;
    rest.splice(at, 0, ...moving);
    o.plan = rest;
    o.sel = moving.map(p => p.id);
    changed();
  }

  function mount(root) {
    const o = O();
    if (!Doc.cur) return;
    const input = root.querySelector('#orgRange');
    if (input) input.addEventListener('input', function () {
      o.range = input.value;
      if (!input.value.trim()) { o.sel = []; o.rangeErr = ''; return paint(); }
      const r = Ranges.parse(input.value, o.plan.length);
      if (!r.ok) { o.rangeErr = r.error; return paint(); }
      o.rangeErr = '';
      o.sel = Array.from(new Set(r.pages.map(n => o.plan[n - 1].id)));
      paint();
    });
    root.querySelectorAll('#orgGrid .pg').forEach(function (el) {
      const id = Number(el.dataset.id), i = Number(el.dataset.i);
      const toggle = function (shift) {
        const s = new Set(o.sel);
        if (shift && o.last != null && o.last < o.plan.length) {
          const [a, b] = [Math.min(o.last, i), Math.max(o.last, i)];
          for (let k = a; k <= b; k++) s.add(o.plan[k].id);
        } else if (s.has(id)) s.delete(id); else s.add(id);
        o.last = i;
        select(Array.from(s));
        if (input) input.value = o.range;
        paint();
      };
      el.addEventListener('click', e => toggle(e.shiftKey));
      el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(e.shiftKey); } });
      el.addEventListener('dragstart', function (e) { o.dragId = id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'page'); });
      el.addEventListener('dragend', function () { o.dragId = null; root.querySelectorAll('#orgGrid .pg').forEach(c => c.classList.remove('dragging', 'drop-before', 'drop-after')); });
      el.addEventListener('dragover', function (e) {
        if (o.dragId == null) return;
        e.preventDefault();
        const r = el.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
        el.classList.toggle('drop-after', after); el.classList.toggle('drop-before', !after);
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
      el.addEventListener('drop', function (e) {
        if (o.dragId == null) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        moveBlock(o.dragId, i, e.clientX > r.left + r.width / 2);
      });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (UI.page() !== 'organize' || !Doc.cur || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && O().sel.length) { e.preventDefault(); A['organize.del'](); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); A['organize.all'](); }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); A['organize.undo'](); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); A['organize.redo'](); }
    else if (e.key === 'Escape' && O().sel.length) A['organize.none']();
  });

  App.register({
    id: 'organize', label: 'Organize pages', icon: 'grid', group: 'Pages', order: 10, tone: 'blue',
    sub: 'Pick pages by range or click, then reorder, rotate, delete, duplicate, extract or split.',
    blurb: 'Pick pages like 1-4, 8-9, reorder by dragging, rotate, delete, duplicate, extract, or split into files.',
    state: () => ({ plan: [], nextId: 1, sel: [], hist: [], fut: [], range: '', rangeErr: '', last: null, dragId: null, splitMode: 'page', splitN: 2 }),
    render: render, mount: mount
  });
})();
