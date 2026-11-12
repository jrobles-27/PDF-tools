/* Page-range parser. Pure: no DOM, runs in the browser and under Node.
 *
 *   Ranges.parse('1-4, 8-9', 12) -> { ok, groups:[{label,pages}], pages:[...] } | { ok:false, error }
 *   Ranges.compress([1,2,3,8,9]) -> '1-3, 8-9'
 *
 * Accepted: 1-4, 8-9   5- (to the end)   -3 (first three)   last / end   all   4-1 (reversed)   2,2 (repeats). */
(function (root) {
  'use strict';

  function parse(text, total) {
    const source = String(text || '').trim().toLowerCase();
    const bad = 'Enter the pages you want, for example 1-4, 8-9.';
    if (!source) return { ok: false, error: bad };
    const groups = [];
    for (const rawToken of source.split(/[,;]+/)) {
      const token = rawToken.trim().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
      if (!token) continue;
      for (const part of token.split(' ')) {
        if (!part) continue;
        const at = word => (word === 'last' || word === 'end' ? total : /^\d+$/.test(word) ? Number(word) : NaN);
        let from, to;
        if (part === 'all') { from = 1; to = total; }
        else if (/^-\w+$/.test(part)) { from = 1; to = at(part.slice(1)); }
        else if (/^\w+-$/.test(part)) { from = at(part.slice(0, -1)); to = total; }
        else if (/^\w+-\w+$/.test(part)) { const ab = part.split('-'); from = at(ab[0]); to = at(ab[1]); }
        else { from = at(part); to = from; }
        if (!Number.isFinite(from) || !Number.isFinite(to)) return { ok: false, error: '“' + part + '” is not a page or page range.' };
        for (const n of [from, to]) {
          if (n < 1) return { ok: false, error: 'Page numbers start at 1.' };
          if (n > total) return { ok: false, error: 'Page ' + n + ' does not exist. This PDF has ' + total + ' page' + (total === 1 ? '' : 's') + '.' };
        }
        const pages = [];
        if (from <= to) for (let n = from; n <= to; n++) pages.push(n);
        else for (let n = from; n >= to; n--) pages.push(n);
        groups.push({ label: from === to ? String(from) : from + '-' + to, pages: pages });
      }
    }
    if (!groups.length) return { ok: false, error: bad };
    return { ok: true, groups: groups, pages: [].concat.apply([], groups.map(g => g.pages)) };
  }

  /** Sorted, de-duplicated list of page numbers as the shortest range text. */
  function compress(pages) {
    const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      parts.push(j > i ? sorted[i] + '-' + sorted[j] : String(sorted[i]));
      i = j + 1;
    }
    return parts.join(', ');
  }

  const api = { parse: parse, compress: compress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Ranges = api;
})(typeof window !== 'undefined' ? window : globalThis);
