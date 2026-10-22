import { describe, it, expect } from 'vitest';
import { crc32, pack } from '../engine/zip';

describe('crc32', () => {
  it('标准校验向量 "123456789" → 0xCBF43926', () => {
    const bytes = new TextEncoder().encode('123456789');
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});

describe('pack', () => {
  it('生成合法 ZIP：签名 / UTF-8 标志 / EOCD 数量正确', async () => {
    const blob = await pack([
      { name: '治愈卡片_01.jpg', blob: new Blob([new Uint8Array([1, 2, 3])]) },
      { name: 'card_02.jpg', blob: new Blob([new Uint8Array([4, 5])]) },
    ]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const dv = new DataView(buf.buffer);

    // 本地文件头签名 PK\x03\x04
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // general purpose bit 11（UTF-8 文件名）
    expect(dv.getUint16(6, true) & 0x0800).toBe(0x0800);
    // EOCD 签名位于尾部 22 字节处
    const eocd = buf.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    expect(dv.getUint16(eocd + 8, true)).toBe(2); // 条目数
    expect(dv.getUint16(eocd + 10, true)).toBe(2);
    expect(blob.type).toBe('application/zip');
  });
});
