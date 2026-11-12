// Privacy is enforced here, not just promised on a web page. If any of these fail, do not publish.
const fs = require('fs');
const path = require('path');
const { test, ok, eq } = require('./lib');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir.replace(/\\/g, '/'), e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

const ours = walk('js').concat(['index.html'], walk('css'));     // everything we wrote (vendor/ is third-party)
const code = ours.filter(f => /\.(js|html|css)$/.test(f));

test('privacy: our code never uses storage, cookies, networking or tracking APIs', () => {
  const banned = [
    ['localStorage', /\blocalStorage\b/], ['sessionStorage', /\bsessionStorage\b/], ['indexedDB', /\bindexedDB\b/], ['Cache API', /\bcaches\.(open|match)\b/],
    ['cookies', /document\.cookie/], ['sendBeacon', /sendBeacon/], ['XMLHttpRequest', /XMLHttpRequest/], ['WebSocket', /\bWebSocket\b/],
    ['EventSource', /\bEventSource\b/], ['fetch', /\bfetch\s*\(/], ['service workers', /serviceWorker/], ['importScripts', /importScripts/],
    ['Image beacon', /new Image\(\)/], ['analytics', /google-analytics|gtag\(|googletagmanager|plausible|matomo|hotjar|sentry|mixpanel|segment\.com/i],
    ['WebRTC', /RTCPeerConnection/], ['form posts', /<form\b/i], ['iframes', /<iframe\b/i]
  ];
  const hits = [];
  for (const f of code) {
    const text = read(f);
    for (const [name, re] of banned) if (re.test(text)) hits.push(f + ' uses ' + name);
  }
  eq(hits, []);
});

test('privacy: no address outside this site appears in our code', () => {
  const allowed = [/^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)$/, /^https:\/\/github\.com\/jrobles-27\/PDF-tools/];
  const bad = [];
  for (const f of code) {
    const found = read(f).match(/https?:\/\/[^\s"'`)<>]+/g) || [];
    for (const url of found) if (!allowed.some(re => re.test(url))) bad.push(f + ': ' + url);
  }
  eq(bad, []);
});

test('privacy: the page declares a strict content security policy', () => {
  const html = read('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  ok(m, 'no CSP meta tag');
  const csp = Object.fromEntries(m[1].split(';').map(s => s.trim()).filter(Boolean).map(s => { const p = s.split(/\s+/); return [p[0], p.slice(1)]; }));
  eq(csp['default-src'], ["'none'"]);
  eq(csp['connect-src'], ["'self'"], 'the page may only talk to its own host');
  eq(csp['form-action'], ["'none'"]);
  eq(csp['object-src'], ["'none'"]);
  eq(csp['base-uri'], ["'none'"]);
  ok(!/https?:/.test(m[1]), 'CSP must not allow any other host');
  ok(csp['script-src'].every(s => /^'self'$|^'wasm-unsafe-eval'$/.test(s)), 'script-src may only be self (and wasm for pdf.js): ' + csp['script-src']);
  ok(!/unsafe-eval'/.test(m[1].replace("'wasm-unsafe-eval'", '')), 'no unsafe-eval');
  ok(/name="referrer"\s+content="no-referrer"/.test(html), 'referrer policy');
});

test('privacy: scripts, styles and fonts are all loaded from this site', () => {
  const html = read('index.html');
  const refs = (html.match(/(?:src|href)="[^"]+"/g) || []).map(s => s.replace(/^(src|href)="|"$/g, ''));
  const external = refs.filter(r => /^(https?:)?\/\//i.test(r) && !/^https:\/\/github\.com\/jrobles-27\/PDF-tools/.test(r));
  eq(external, []);
});

test('theme: the page opens in the system theme before first paint, and the choice is never stored', () => {
  const html = read('index.html');
  const init = read('js/theme-init.js');
  ok(/prefers-color-scheme:\s*dark/.test(init) && /data-theme/.test(init), 'theme-init.js should read the system setting');
  ok(html.indexOf('js/theme-init.js') > 0 && html.indexOf('js/theme-init.js') < html.indexOf('css/theme.css'), 'theme-init.js must load before the stylesheet');
  ok(/prefers-color-scheme:\s*dark/.test(read('js/main.js')), 'main.js should follow the system setting');
});

test('privacy: nothing that looks like a user file is committed to a public repo', () => {
  const ignore = read('.gitignore');
  for (const pat of ['*.pdf', '*.zip', '*.png', '*.jpg']) ok(ignore.split(/\r?\n/).includes(pat), '.gitignore should list ' + pat);
});
