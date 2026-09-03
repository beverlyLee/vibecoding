/* engine/zip.ts · 零依赖 ZIP 打包（store 模式 + UTF-8 中文名，general purpose bit 11） */

export interface ZipEntry { name: string; blob: Blob }

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function pack(files: ZipEntry[]): Promise<Blob> {
  return Promise.all(files.map(f => f.blob.arrayBuffer().then(b => new Uint8Array(b))))
    .then(buffers => {
      const enc = new TextEncoder();
      const locals: Uint8Array<ArrayBuffer>[] = [];
      const centrals: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;
      const UTF8_FLAG = 0x0800;

      files.forEach((f, i) => {
        const nameBytes = enc.encode(f.name);
        const data = buffers[i];
        const crc = crc32(data);

        const lh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, UTF8_FLAG, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0x21, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        lh.set(nameBytes, 30);
        locals.push(lh, data);

        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, UTF8_FLAG, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0x21, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        centrals.push(ch);

        offset += lh.length + data.length;
      });

      const cdSize = centrals.reduce((s, c) => s + c.length, 0);
      const cdOffset = offset;

      const eo = new Uint8Array(22);
      const ev = new DataView(eo.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, files.length, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, cdOffset, true);
      ev.setUint16(20, 0, true);

      return new Blob([...locals, ...centrals, eo], { type: 'application/zip' });
    });
}
