/* Password protection and lossless tidying, using qpdf (compiled to WebAssembly, bundled in vendor/qpdf/).
 * Pure: no DOM, no network, no storage. Bytes in, bytes out. Runs in the browser and under Node.
 *
 * `create(factory)` takes a function that returns a fresh qpdf module (a clean in-memory file system each time):
 *     factory({ preRun }) -> Promise<module>      (pass `preRun` straight through to the module options)
 * Passwords only ever exist in memory, as arguments to qpdf inside this tab. They are never logged. */
(function (root) {
  'use strict';

  const node = typeof require === 'function' && typeof module !== 'undefined' && module.exports;
  const PdfOps = node ? require('./pdfops.js') : root.PdfOps;
  const { UserError } = PdfOps;

  const latin1 = new TextDecoder('latin1');

  /** A quick look (no WebAssembly) at whether a file declares encryption. The first and last 64 KB cover every layout. */
  function looksEncrypted(bytes) {
    const n = bytes.length, win = 65536;
    const parts = n <= win * 2 ? [bytes] : [bytes.subarray(0, win), bytes.subarray(n - win)];
    return parts.some(p => /\/Encrypt\s+\d+\s+\d+\s+R/.test(latin1.decode(p)));
  }

  function randomPassword(len) {
    const cr = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const buf = cr.getRandomValues(new Uint8Array(len));
    return Array.from(buf, b => chars[b % chars.length]).join('');
  }

  function create(factory) {
    // One qpdf instance is reused (it loads once); runs are queued, and the files are removed after each run.
    // qpdf writes its messages to stdout/stderr one character at a time; collect them (the wasm ignores a `print` option).
    let chars = [];
    const sink = c => { if (c !== null && c !== undefined) chars.push(c & 255); };
    let instance = null, queue = Promise.resolve();

    async function runNow(args, inputs) {
      if (!instance) instance = factory({ preRun: [m => m.FS.init(null, sink, sink)] });
      const mod = await instance;
      chars = [];
      const names = Object.keys(inputs).concat('/out.pdf');
      for (const name of Object.keys(inputs)) mod.FS.writeFile(name, inputs[name]);
      let code, out = null;
      try { code = mod.callMain(args); }
      catch (e) {
        if (e && typeof e.status === 'number') code = e.status;
        else { instance = null; throw e; }                    // a crash inside the engine: start fresh next time
      }
      try { out = mod.FS.readFile('/out.pdf'); } catch (e) { out = null; }
      for (const name of names) { try { mod.FS.unlink(name); } catch (e) { /* not there */ } }
      return { code: code, out: out, log: new TextDecoder().decode(Uint8Array.from(chars)) };
    }

    /** Runs qpdf once. Returns { code, out (Uint8Array|null), log }. */
    function run(args, inputs) {
      const job = queue.then(() => runNow(args, inputs));
      queue = job.then(null, () => {});
      return job;
    }

    /** 'none' (no password), 'open' (needs a password to open), 'owner' (opens freely but has an owner password). */
    async function protection(bytes) {
      if (!looksEncrypted(bytes)) return 'none';
      const r = await run(['--requires-password', '/in.pdf'], { '/in.pdf': bytes });
      if (/invalid password/i.test(r.log) || r.code === 0) return 'open';
      return r.code === 3 ? 'owner' : 'none';
    }

    /** Returns a copy with encryption removed. Throws UserError('That password did not work.') for a wrong password. */
    async function decrypt(bytes, password) {
      const r = await run(['--password=' + (password || ''), '--decrypt', '/in.pdf', '/out.pdf'], { '/in.pdf': bytes });
      if (/invalid password/i.test(r.log)) {
        throw new UserError(password ? 'That password did not work.' : 'This PDF needs a password.');
      }
      if (!r.out) throw new UserError('This PDF could not be read. It may be damaged.');
      return r.out;
    }

    /**
     * AES-256 encryption. opts: { userPassword (required, to open), ownerPassword (optional), allowPrint, allowCopy, allowEdit }.
     * The permission switches are a courtesy honoured by most readers, not strong protection: the opening password is.
     * With no owner password a random one is made and forgotten, so the limits cannot be lifted by the owner either.
     */
    async function encrypt(bytes, opts) {
      const user = String((opts && opts.userPassword) || '');
      if (!user) throw new UserError('Enter a password to protect the PDF with.');
      if (looksEncrypted(bytes)) throw new UserError('This PDF already has a password. Remove it first.');
      const owner = String((opts && opts.ownerPassword) || '') || randomPassword(24);
      const args = ['/in.pdf', '--encrypt', user, owner, '256'];
      if (opts.allowPrint === false) args.push('--print=none');
      if (opts.allowCopy === false) args.push('--extract=n');
      if (opts.allowEdit === false) args.push('--modify=none');
      args.push('--', '/out.pdf');
      const r = await run(args, { '/in.pdf': bytes });
      if (!r.out || r.code === 2) throw new UserError('This PDF could not be protected. It may be damaged.');
      return r.out;
    }

    /** Lossless tidy-up: packs objects together and recompresses with the strongest setting. Nothing visible changes. */
    async function optimize(bytes) {
      const r = await run(['/in.pdf', '--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', '/out.pdf'], { '/in.pdf': bytes });
      if (!r.out || r.code === 2) throw new UserError('This PDF could not be read. It may be damaged.');
      return r.out;
    }

    return { run: run, protection: protection, decrypt: decrypt, encrypt: encrypt, optimize: optimize };
  }

  const api = { create: create, looksEncrypted: looksEncrypted, randomPassword: randomPassword };
  if (node) module.exports = api; else root.Qpdf = api;
})(typeof window !== 'undefined' ? window : globalThis);
