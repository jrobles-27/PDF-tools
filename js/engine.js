/* Browser-side engine: draws PDF pages with pdf.js, picks files, offers downloads.
 * Nothing here talks to a server; pdf.js only reads its own bundled files from this site. */
(function (root) {
  'use strict';

  const MAX_SIDE = 16000;
  const MAX_PIXELS = 200e6;
  const base = () => new URL('vendor/pdfjs/', document.baseURI).href;

  let libPromise = null;
  function lib() {
    if (!libPromise) {
      libPromise = import(base() + 'pdf.min.mjs').then(function (m) {
        m.GlobalWorkerOptions.workerSrc = base() + 'pdf.worker.min.mjs';
        return m;
      });
    }
    return libPromise;
  }

  /** Open bytes with pdf.js (for drawing and text). The bytes are copied, so the caller keeps its own. */
  async function openPdf(bytes) {
    const m = await lib();
    try {
      return await m.getDocument({
        data: bytes.slice(), cMapUrl: base() + 'cmaps/', cMapPacked: true, standardFontDataUrl: base() + 'standard_fonts/',
        wasmUrl: base() + 'wasm/', iccUrl: base() + 'iccs/', isEvalSupported: false, verbosity: 0
      }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove its password first, then try again.');
      throw new Error('This PDF could not be read. It may be damaged.');
    }
  }

  function closePdf(doc) {
    try { if (doc && doc.loadingTask) doc.loadingTask.destroy(); } catch (e) { /* already closed */ }
  }

  /** Draw a page at a scale (1 = 72 dpi). Huge requests are capped to what a canvas can hold. */
  async function render(page, scale, canvas) {
    const nat = page.getViewport({ scale: 1 });
    const cap = Math.min(1, MAX_SIDE / (Math.max(nat.width, nat.height) * scale), Math.sqrt(MAX_PIXELS / (nat.width * nat.height * scale * scale)));
    const used = scale * cap;
    const vp = page.getViewport({ scale: used });
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport: vp, background: 'rgb(255,255,255)' }).promise;
    return { scale: used, capped: cap < 1, width: canvas.width, height: canvas.height };
  }

  function toBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('That page is too large to turn into a picture. Try a lower resolution.'))), mime, quality);
    });
  }

  /** Runs a few jobs at a time so thumbnails do not freeze the page. */
  function queue(limit) {
    let running = 0;
    const waiting = [];
    const pump = function () {
      while (running < limit && waiting.length) {
        const job = waiting.shift();
        running++;
        job().then(null, () => {}).then(function () { running--; pump(); });
      }
    };
    return job => { waiting.push(job); pump(); };
  }
  const thumbQueue = queue(2);

  /** A small JPEG object URL for page n (1-based). The caller owns and revokes the URL. */
  function thumb(doc, n, maxW, maxH) {
    return new Promise(function (resolve, reject) {
      thumbQueue(async function () {
        try {
          const page = await doc.getPage(n);
          const nat = page.getViewport({ scale: 1 });
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const canvas = document.createElement('canvas');
          await render(page, Math.min(maxW / nat.width, maxH / nat.height) * dpr, canvas);
          const blob = await toBlob(canvas, 'image/jpeg', 0.85);
          canvas.width = 0;
          resolve(URL.createObjectURL(blob));
        } catch (e) { reject(e); }
      });
    });
  }

  async function pageText(doc, n) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    return content.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('').replace(/[ \t]+\n/g, '\n').trim();
  }

  // ---------- files ----------

  /** Opens the browser's file picker. Resolves with the chosen files, or [] if cancelled. */
  function chooseFiles(accept, multiple) {
    return new Promise(function (resolve) {
      const input = document.getElementById('filePicker');
      input.value = '';
      input.accept = accept;
      input.multiple = !!multiple;
      input.addEventListener('change', () => resolve(Array.from(input.files)), { once: true });
      input.addEventListener('cancel', () => resolve([]), { once: true });
      input.click();
    });
  }

  async function readBytes(file) { return new Uint8Array(await file.arrayBuffer()); }

  /** Hands bytes or a Blob to the browser as a download. Nothing is sent anywhere. */
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const stem = name => String(name).replace(/\.[^.\\/]+$/, '');
  const safeName = text => String(text).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 120) || 'file';

  /** Make file names unique within one ZIP: a.png, a (2).png ... */
  function uniqueNames(names) {
    const seen = new Map();
    return names.map(function (n) {
      const k = n.toLowerCase();
      const c = (seen.get(k) || 0) + 1;
      seen.set(k, c);
      if (c === 1) return n;
      const dot = n.lastIndexOf('.');
      return dot > 0 ? n.slice(0, dot) + ' (' + c + ')' + n.slice(dot) : n + ' (' + c + ')';
    });
  }

  /** 'jpg' | 'png' | null, from the first bytes. */
  function imageKind(b) {
    if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'jpg';
    return null;
  }

  /** Any other picture the browser can decode (WebP, GIF, BMP, AVIF) becomes PNG, which loses nothing. */
  async function imageToPng(file) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await toBlob(canvas, 'image/png');
    canvas.width = 0;
    return new Uint8Array(await blob.arrayBuffer());
  }

  const fmtSize = n => (n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  root.Engine = {
    openPdf: openPdf, closePdf: closePdf, render: render, toBlob: toBlob, thumb: thumb, pageText: pageText, queue: queue,
    chooseFiles: chooseFiles, readBytes: readBytes, download: download, stem: stem, safeName: safeName, uniqueNames: uniqueNames,
    imageKind: imageKind, imageToPng: imageToPng, fmtSize: fmtSize, plural: plural
  };
})(window);
