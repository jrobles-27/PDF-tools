/* Minimal ZIP writer ("stored", no compression) so several results can be one download.
 * Images and PDFs are already compressed, so storing them is the right trade. Pure; browser and Node.
 *
 *   await Zip.build([{ name:'a.png', data: Uint8Array | Blob }, ...]) -> Blob
 *
 * Names must be unique (the caller makes them so). Entries above 4 GB are refused (no ZIP64). */
(function (root) {
  'use strict';

  const TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function dosStamp(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time, date: date };
  }

  async function build(entries) {
    const enc = new TextEncoder();
    const when = dosStamp(new Date());
    const parts = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer());
      if (data.length > 0xfffffffe) throw new Error('A file is too large to put in a ZIP (4 GB limit).');
      const name = enc.encode(e.name);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, when.time, true);
      local.setUint16(12, when.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, when.time, true);
      cd.setUint16(14, when.date, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
      if (offset > 0xfffffffe) throw new Error('These files are too large for one ZIP (4 GB limit). Try fewer pages.');
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  const api = { build: build, crc32: crc32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Zip = api;
})(typeof window !== 'undefined' ? window : globalThis);
