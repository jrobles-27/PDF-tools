/* Dashboard UI kit: app shell, components, sortable tables, themed charts.
 * No build step, no framework. Load before your app.js; it exposes a global `UI`.
 *
 *   UI.start({ pages, render, initial })   boot the shell
 *   UI.refresh()                           re-render the current page
 *
 * Pages are plain functions returning an HTML string. Re-render on every state change;
 * it is fast enough and removes a whole class of stale-DOM bugs. */
(function (root) {
  'use strict';

  // ---------- icons (Lucide-style 24x24 paths; add your own freely) ----------
  const ICONS = {
    dash: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    bar: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
    cog: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    cal: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-2.93 1.41-1.41m11.32-11.32 1.41-1.41M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
  };
  const I = n => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.dash) + '</svg>';

  // Categorical palette. Index 0 is the accent blue; keep this order so colours stay stable.
  const PALETTE = ['#3b6cf6', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#6366f1', '#14b8a6', '#eab308'];
  const GREY = '#71717a';

  // ---------- small helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d) => Math.abs(v) < 1e-9 ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  /** Never print a misleading "0": a nonzero value that rounds to zero shows as "<1". */
  function cell(v, d) {
    if (Math.abs(v) < 1e-9) return '–';
    const step = Math.pow(10, -(d || 0));
    if (Math.abs(v) < step / 2) return (v < 0 ? '>-' : '<') + step.toFixed(d || 0);
    return v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  // ---------- components (all return HTML strings) ----------
  function card(title, sub, body, tools, flush) {
    return '<section class="card"><div class="card-h"><div><h3>' + title + '</h3>' +
      (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      (tools ? '<div class="tools">' + tools + '</div>' : '') +
      '</div><div class="card-b' + (flush ? ' flush' : '') + '">' + body + '</div></section>';
  }
  /** Segmented control. `path` is yours to interpret in a data-set handler. */
  function seg(path, cur, opts) {
    return '<div class="seg">' + opts.map(function (o) {
      return '<button class="' + (o[0] === cur ? 'on' : '') + '" data-set="' + path + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function select(label, path, cur, opts) {
    return '<div class="field"><label>' + esc(label) + '</label><select data-bind="' + path + '">' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></div>';
  }
  function spark(values, color, uid) {
    const w = 200, h = 44, n = (values || []).length;
    if (n < 2) return '';
    const mx = Math.max.apply(null, values.concat([1e-9])), mn = Math.min.apply(null, values.concat([0]));
    const pts = values.map((v, i) => [i * w / (n - 1), h - 4 - (v - mn) / (mx - mn || 1) * (h - 12)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="sg' + uid +
      '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color +
      '" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="url(#sg' + uid +
      ')"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  }
  /** KPI tile: {label, value, unit, sub, icon, cls, spark, color}. cls is blue|green|amber|violet|rose. */
  function kpi(o) {
    const uid = o.id || Math.random().toString(36).slice(2);
    return '<div class="card kpi"><div class="top"><div><div class="lbl">' + esc(o.label) + '</div><div class="val">' + o.value +
      '<small>' + esc(o.unit || '') + '</small></div></div><div class="chip bg-' + o.cls + ' c-' + o.cls + '">' + I(o.icon) +
      '</div></div><div class="sub">' + (o.sub || '') + '</div>' + spark(o.spark, o.color || PALETTE[0], uid) + '</div>';
  }
  function empty(o) {
    o = o || {};
    return '<div class="card"><div class="empty">' + I(o.icon || 'upload') + '<h3>' + esc(o.title || 'Nothing here yet') + '</h3><p>' +
      esc(o.text || '') + '</p>' + (o.action ? '<button class="btn primary" data-go="' + o.action[1] + '">' + esc(o.action[0]) + '</button>' : '') + '</div></div>';
  }
  function note(html, icon) { return '<div class="note">' + I(icon || 'lock') + '<div>' + html + '</div></div>'; }
  /** level: error | warn | info | ok */
  function issue(level, title, detail) {
    return '<div class="issue"><span class="tag ' + level + '">' + level + '</span><div><b>' + esc(title) + '</b><span class="d">' + esc(detail || '') + '</span></div></div>';
  }

  // ---------- sortable / filterable matrix table ----------
  const tbl = {};
  function tstate(id) { return tbl[id] || (tbl[id] = { sort: null, filter: '' }); }
  function tableTools(id, hasFilter) {
    const t = tstate(id);
    const sorted = t.sort ? '<button class="btn sm ghost" data-tbl-reset="' + id + '" title="Back to the natural order">' + I('reset') + ' Sort</button>' : '';
    const filter = hasFilter === false ? '' : '<label class="tfilter">' + I('search') + '<input data-tbl-filter="' + id + '" value="' + esc(t.filter) + '" placeholder="Filter rows" aria-label="Filter rows"></label>';
    return filter + sorted;
  }

  /** Grid of numbers with a heat map, sortable headers, a row filter and sticky header/first column.
   *  data:  { rowKeys, colKeys, get(rowKey,colKey), rowTotals[], colTotals[], total }  (see pivot())
   *  o.cols: [{label, get(rowKey), key?(rowKey)}] leading columns. Give `key` so dates and other
   *          non-text values sort by value rather than by their printed label.
   *  o.colFmt: colKey -> header text.  o.dec: decimals.  o.heat: false turns the shading off. */
  function matrix(data, o) {
    o = o || {};
    const id = o.id || 't', st = tstate(id), d = o.dec || 0;
    const lead = o.cols || [{ label: o.rowHdr || '', get: rk => rk, key: rk => rk }];
    const cols = data.colKeys.map((ck, j) => [ck, j]).filter(x => o.keepCols || Math.abs(data.colTotals[x[1]]) > 1e-9);
    let rows = data.rowKeys.map((rk, i) => [rk, i]).filter(x => o.keepRows || Math.abs(data.rowTotals[x[1]]) > 1e-9);
    const q = st.filter.trim().toLowerCase();
    if (q) rows = rows.filter(x => lead.some(c => String(c.get(x[0])).toLowerCase().indexOf(q) >= 0));
    if (st.sort) {
      const col = st.sort.col, dir = st.sort.dir;
      const keyOf = function (x) {
        if (col === 'T') return data.rowTotals[x[1]];
        if (typeof col === 'string' && col[0] === 'L') { const c = lead[+col.slice(1)]; return c ? (c.key ? c.key(x[0]) : String(c.get(x[0]))) : ''; }
        return data.get(x[0], cols[col][0]);
      };
      rows = rows.slice().sort(function (a, b) {
        const x = keyOf(a), y = keyOf(b), nx = typeof x === 'number', ny = typeof y === 'number';
        const c = nx && ny ? x - y : nx ? -1 : ny ? 1 : String(x).localeCompare(String(y));
        return dir === 'asc' ? c : -c;
      });
    }
    let max = 0;
    rows.forEach(x => cols.forEach(c => { max = Math.max(max, data.get(x[0], c[0])); }));
    const arrow = i => st.sort && String(st.sort.col) === String(i) ? '<i class="sa">' + (st.sort.dir === 'asc' ? '▲' : '▼') + '</i>' : '';
    const tall = rows.length > 12 ? ' tall' : '';
    let h = '<div class="tbl-wrap' + tall + '"><table class="m"><thead><tr>' +
      lead.map((c, i) => '<th class="lead" data-tbl-sort="' + id + '|L' + i + '">' + esc(c.label) + arrow('L' + i) + '</th>').join('') +
      cols.map((c, j) => '<th data-tbl-sort="' + id + '|' + j + '">' + esc(o.colFmt ? o.colFmt(c[0]) : c[0]) + arrow(j) + '</th>').join('') +
      '<th class="tot" data-tbl-sort="' + id + '|T">Total' + arrow('T') + '</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      const rk = x[0];
      const sw = o.rowColor ? '<span class="sw" style="background:' + o.rowColor(rk) + '"></span>' : '';
      h += '<tr>' + lead.map((c, li) => '<td class="lead">' + (li === 0 ? sw : '') + esc(c.get(rk)) + '</td>').join('');
      cols.forEach(function (c) {
        const v = data.get(rk, c[0]);
        const a = max > 0 && v > 1e-9 && o.heat !== false ? Math.round(6 + 52 * v / max) : 0;
        h += '<td class="' + (Math.abs(v) < 1e-9 ? 'zero' : '') + '"' +
          (a ? ' style="background:color-mix(in oklab, var(--blue) ' + a + '%, transparent)"' : '') + '>' + cell(v, d) + '</td>';
      });
      h += '<td class="tot">' + cell(data.rowTotals[x[1]], d) + '</td></tr>';
    });
    if (!rows.length) h += '<tr><td colspan="' + (cols.length + lead.length + 1) + '" style="text-align:center;color:var(--muted-foreground)">' +
      (q ? 'No rows match this filter' : 'Nothing to show') + '</td></tr>';
    h += '<tr class="tot">' + lead.map((c, li) => '<td class="lead">' + (li === 0 ? 'Total' : '') + '</td>').join('') +
      cols.map(c => '<td>' + cell(data.colTotals[c[1]], d) + '</td>').join('') +
      '<td>' + cell(data.total, d) + '</td></tr></tbody></table></div>';
    return h;
  }

  /** Build the matrix `data` shape from flat rows [{r, c, v}]. Pass key arrays to fix the order. */
  function pivot(rows, rowKeys, colKeys) {
    const m = new Map();
    rows.forEach(x => { const k = x.r + '\u0001' + x.c; m.set(k, (m.get(k) || 0) + x.v); });
    const rk = rowKeys || Array.from(new Set(rows.map(x => x.r)));
    const ck = colKeys || Array.from(new Set(rows.map(x => x.c)));
    const get = (a, b) => m.get(a + '\u0001' + b) || 0;
    const rowTotals = rk.map(a => ck.reduce((s, b) => s + get(a, b), 0));
    const colTotals = ck.map(b => rk.reduce((s, a) => s + get(a, b), 0));
    return { rowKeys: rk, colKeys: ck, get: get, rowTotals: rowTotals, colTotals: colTotals, total: rowTotals.reduce((s, x) => s + x, 0) };
  }

  /** Percentage view of a pivot. basis: 'row' | 'col' | 'total'. */
  function pct(pv, basis) {
    const T = pv.total || 1;
    const get = function (rk, ck) {
      const i = pv.rowKeys.indexOf(rk), j = pv.colKeys.indexOf(ck), v = pv.get(rk, ck);
      const den = basis === 'row' ? pv.rowTotals[i] : basis === 'col' ? pv.colTotals[j] : T;
      return den > 1e-9 ? v / den * 100 : 0;
    };
    const share = x => x / T * 100;
    return {
      rowKeys: pv.rowKeys, colKeys: pv.colKeys, get: get,
      rowTotals: pv.rowTotals.map(x => basis === 'row' ? (x > 1e-9 ? 100 : 0) : share(x)),
      colTotals: pv.colTotals.map(x => basis === 'col' ? (x > 1e-9 ? 100 : 0) : share(x)),
      total: pv.total > 1e-9 ? 100 : 0
    };
  }

  // ---------- charts (Chart.js, themed) ----------
  const charts = [], after = [];
  function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    return {
      text: cs.getPropertyValue('--muted-foreground').trim() || '#999',
      grid: cs.getPropertyValue('--grid').trim() || 'rgba(0,0,0,.07)',
      card: getComputedStyle(document.body).backgroundColor
    };
  }
  /** series: [{label, data[], color?}]. o: {stacked, unit, type:'bar'|'line', tall} */
  function barChart(id, labels, series, o) {
    o = o || {};
    const unit = o.unit || '';
    after.push(function () {
      const el = document.getElementById(id);
      if (!el || !root.Chart) return;
      const t = themeColors();
      charts.push(new root.Chart(el, {
        type: o.type || 'bar',
        data: {
          labels: labels,
          datasets: series.map((s, i) => ({
            label: s.label, data: s.data,
            backgroundColor: s.color || PALETTE[i % PALETTE.length],
            borderColor: s.color || PALETTE[i % PALETTE.length],
            borderRadius: o.stacked ? 0 : 3, borderSkipped: false, maxBarThickness: 56,
            fill: false, tension: 0.35
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { color: t.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } } },
            tooltip: {
              filter: it => Math.abs(it.parsed.y) > 1e-9,           // hide series with nothing here
              itemSort: (a, b) => a.datasetIndex - b.datasetIndex,  // keep series order, not by size
              callbacks: { label: c => ' ' + c.dataset.label + ': ' + cell(c.parsed.y, unit === '%' ? 1 : 0) + (unit ? ' ' + unit : '') }
            }
          },
          scales: {
            x: { stacked: !!o.stacked, grid: { display: false }, ticks: { color: t.text } },
            y: Object.assign({
              stacked: !!o.stacked, grid: { color: t.grid }, border: { display: false },
              ticks: { color: t.text, callback: v => fmt(v) },
              title: unit ? { display: true, text: unit, color: t.text } : undefined
            }, unit === '%' ? { max: 100 } : {})
          }
        }
      }));
    });
    return '<div class="chart-box' + (o.tall ? ' tall' : '') + '"><canvas id="' + id + '"></canvas></div>';
  }
  function donut(id, labels, data, colors, height) {
    after.push(function () {
      const el = document.getElementById(id);
      if (!el || !root.Chart) return;
      const t = themeColors();
      charts.push(new root.Chart(el, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors || labels.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: t.card, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + fmt(c.parsed) } } } }
      }));
    });
    return '<div class="chart-box" style="height:' + (height || 200) + 'px"><canvas id="' + id + '"></canvas></div>';
  }

  // ---------- shell ----------
  const S = { page: null, pages: [], render: null };
  const hooks = [];   // run after every render, so a page can wire up the DOM it just produced

  function renderNav() {
    const groups = Array.from(new Set(S.pages.map(p => p.group || '')));
    $('#nav').innerHTML = groups.map(function (g) {
      return (g ? '<div class="nav-label">' + esc(g) + '</div>' : '') +
        S.pages.filter(p => (p.group || '') === g).map(function (p) {
          return '<button class="nav-item' + (p.id === S.page ? ' active' : '') + '" data-go="' + p.id + '" title="' + esc(p.label) + '">' +
            I(p.icon) + '<span>' + esc(p.label) + '</span>' +
            (p.badge ? '<em class="badge ' + (p.badgeCls || '') + '" style="font-style:normal">' + esc(p.badge) + '</em>' : '') + '</button>';
        }).join('');
    }).join('');
  }
  function refresh() {
    charts.forEach(c => c.destroy());
    charts.length = 0; after.length = 0;
    const y = window.scrollY;
    const pg = S.pages.filter(p => p.id === S.page)[0] || S.pages[0];
    let body;
    try { body = S.render(pg.id); }
    catch (e) { console.error(e); body = card('Something went wrong', '', '<p style="color:var(--rose)">' + esc(e.message) + '</p>'); }
    $('#page').innerHTML = '<div class="page-head"><h1>' + esc(pg.label) + '</h1>' + (pg.sub ? '<p>' + esc(pg.sub) + '</p>' : '') + '</div>' + body;
    after.slice().forEach(fn => fn());
    hooks.forEach(fn => { try { fn(pg.id); } catch (e) { console.error(e); } });
    renderNav();
    window.scrollTo(0, y);
  }
  function go(id) {
    if (!S.pages.some(p => p.id === id)) return;
    S.page = id;
    if (location.hash !== '#/' + id) history.replaceState(null, '', '#/' + id);
    $('#app').classList.remove('mobile-open');
    window.scrollTo(0, 0);
    refresh();
  }

  function start(cfg) {
    S.pages = cfg.pages;
    S.render = cfg.render;
    $('#logo').innerHTML = '<svg class="i" style="width:16px;height:16px" viewBox="0 0 24 24">' + (ICONS[cfg.logo || 'layers']) + '</svg>';
    $('#collapse').innerHTML = I('left');
    $('#searchIc').innerHTML = I('search');
    $('#menuBtn').innerHTML = I('menu');
    if ($('#footIc')) $('#footIc').innerHTML = I(cfg.footIcon || 'lock');
    // Topbar primary button: configure it or it stays hidden rather than showing an empty pill.
    const pb = $('#primaryBtn');
    if (pb) {
      if (cfg.primary) {
        pb.innerHTML = (cfg.primary.icon ? I(cfg.primary.icon) : '') + esc(cfg.primary.label);
        if (cfg.primary.act) pb.setAttribute('data-act', cfg.primary.act);
        if (cfg.primary.go) pb.setAttribute('data-go', cfg.primary.go);
      } else pb.style.display = 'none';
    }
    const setTheme = function (t) {
      document.documentElement.setAttribute('data-theme', t);
      $('#theme').innerHTML = I(t === 'dark' ? 'sun' : 'moon');
    };
    S.setTheme = setTheme;
    setTheme(cfg.theme || 'light');
    $('#theme').addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      refresh();   // charts must be rebuilt to pick up the new axis colours
    });
    $('#collapse').addEventListener('click', () => $('#app').classList.toggle('collapsed'));
    $('#menuBtn').addEventListener('click', () => $('#app').classList.toggle('mobile-open'));

    // command palette
    const si = $('#search'), sr = $('#searchRes');
    const show = function () {
      const q = si.value.trim().toLowerCase();
      const hits = S.pages.filter(p => !q || p.label.toLowerCase().indexOf(q) >= 0 || (p.sub || '').toLowerCase().indexOf(q) >= 0);
      sr.innerHTML = hits.map((p, i) => '<button data-go="' + p.id + '" class="' + (i === 0 ? 'hl' : '') + '">' + I(p.icon) + esc(p.label) + '</button>').join('');
      sr.classList.toggle('open', document.activeElement === si && hits.length > 0);
    };
    si.addEventListener('input', show);
    si.addEventListener('focus', show);
    si.addEventListener('blur', () => setTimeout(() => sr.classList.remove('open'), 150));
    si.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { const b = sr.querySelector('button'); if (b) { go(b.dataset.go); si.value = ''; si.blur(); } }
      if (e.key === 'Escape') si.blur();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); si.focus(); }
    });

    // Navigation and table sort/filter are handled here. Everything else (data-set, data-bind,
    // data-act) is yours: add your own delegated listener and call UI.refresh().
    document.addEventListener('click', function (e) {
      const sh = e.target.closest('[data-tbl-sort]');
      if (sh) {
        const parts = sh.dataset.tblSort.split('|'), id = parts[0], c = parts[1], st = tstate(id);
        const col = /^[0-9]+$/.test(c) ? +c : c;
        const first = typeof col === 'string' && col[0] === 'L' ? 'asc' : 'desc';
        st.sort = !st.sort || String(st.sort.col) !== String(col) ? { col: col, dir: first }
          : st.sort.dir === first ? { col: col, dir: first === 'asc' ? 'desc' : 'asc' } : null;
        return refresh();
      }
      const rs = e.target.closest('[data-tbl-reset]');
      if (rs) { tstate(rs.dataset.tblReset).sort = null; return refresh(); }
      const g = e.target.closest('[data-go]');
      if (g) go(g.dataset.go);
    });
    document.addEventListener('input', function (e) {
      const f = e.target.closest('[data-tbl-filter]');
      if (!f) return;
      const id = f.dataset.tblFilter, pos = f.selectionStart;
      tstate(id).filter = f.value;
      refresh();
      const again = document.querySelector('[data-tbl-filter="' + id + '"]');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
    });

    const h = (location.hash || '').replace('#/', '');
    S.page = S.pages.some(p => p.id === h) ? h : (cfg.initial || S.pages[0].id);
    refresh();
    if (cfg.onReady) cfg.onReady();
  }

  /** Topbar status pill. */
  function setState(on, text) {
    $('#stateDot').className = 'dot' + (on ? ' on' : '');
    $('#stateTxt').textContent = text;
  }

  root.UI = {
    I: I, ICONS: ICONS, PALETTE: PALETTE, GREY: GREY,
    esc: esc, fmt: fmt, cell: cell,
    card: card, seg: seg, select: select, kpi: kpi, spark: spark, empty: empty, note: note, issue: issue,
    matrix: matrix, pivot: pivot, pct: pct, tableTools: tableTools, tstate: tstate,
    barChart: barChart, donut: donut, themeColors: themeColors,
    start: start, refresh: refresh, go: go, setState: setState, onRender: fn => hooks.push(fn),
    setTheme: t => { if (S.setTheme) S.setTheme(t); },
    page: function () { return S.page; }
  };
})(window);
