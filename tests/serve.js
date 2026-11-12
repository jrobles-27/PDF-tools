// node tests/serve.js [port]   Plain static server for trying the site locally. No dependencies.
// Optional: set TESTDATA to a folder to also serve it at /__testdata/ (used only to try files in a browser).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = Number(process.argv[2]) || 8080;
const extra = process.env.TESTDATA ? path.resolve(process.env.TESTDATA) : null;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  let base = root;
  if (extra && rel.startsWith('/__testdata/')) { base = extra; rel = rel.slice('/__testdata'.length); }
  const file = path.resolve(base, '.' + rel);
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Serving ' + root + ' at http://127.0.0.1:' + port + '/'));
