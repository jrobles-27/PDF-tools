/* Reads the EXIF orientation (1-8) from JPEG bytes, so phone photos taken sideways can be placed upright.
 * Returns 1 when there is none. Pure; browser and Node. */
(function (root) {
  'use strict';

  function orientation(bytes) {
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
    let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) return 1;
      const marker = bytes[p + 1];
      if (marker === 0xda || marker === 0xd9) return 1;
      const size = (bytes[p + 2] << 8) | bytes[p + 3];
      if (marker === 0xe1 && size >= 14 && bytes[p + 4] === 0x45 && bytes[p + 5] === 0x78 && bytes[p + 6] === 0x69 && bytes[p + 7] === 0x66) {
        const t = p + 10;                                   // start of the TIFF header
        const le = bytes[t] === 0x49;
        const u16 = o => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1]);
        const u32 = o => (le ? (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0 : ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0);
        const ifd = t + u32(t + 4);
        if (ifd + 2 > bytes.length) return 1;
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > bytes.length) return 1;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
      p += 2 + size;
    }
    return 1;
  }

  /** How many degrees clockwise the stored picture must be turned to appear upright. */
  function turn(o) {
    return { 1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270 }[o] || 0;
  }

  const api = { orientation: orientation, turn: turn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Exif = api;
})(typeof window !== 'undefined' ? window : globalThis);
