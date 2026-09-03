import { describe, expect, it, beforeEach } from 'vitest';
import { sanitize, logger, _internals } from '../engine/logger';

describe('logger', () => {
  beforeEach(() => logger.clear());

  it('sanitize 折叠 dataURL 并截断超长字符串', () => {
    const url = 'data:image/png;base64,AAAABBBB';
    const out = sanitize({
      img: url,
      prompt: 'a'.repeat(7000),
      nested: { list: ['data:image/jpeg;base64,XYZ', 42, null] },
    }) as Record<string, unknown>;
    expect(out.img).toBe(`[dataURL ${url.length} chars]`);
    expect(String(out.prompt)).toBe('a'.repeat(6000) + `…[+1000]`);
    const nested = out.nested as Record<string, unknown>;
    expect((nested.list as unknown[])[0]).toBe(`[dataURL 26 chars]`);
  });

  it('按天分片记录并可读取', () => {
    logger.log('ai', { tag: '测试', prompt: '你好'.repeat(10) });
    const days = logger.days();
    expect(days).toHaveLength(1);
    const entries = logger.entries(days[0]);
    expect(entries).toHaveLength(1);
    expect(entries[0].tag).toBe('ai');
    expect(JSON.parse(entries[0].msg).prompt).toBe('你好'.repeat(10));
  });

  it('滚动清理超过保留期的旧分片', () => {
    // 造一个 8 天前的分片，再写一条新日志触发滚动
    const d = new Date();
    d.setDate(d.getDate() - 8);
    const key = `heal-logs-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    _internals.stSet(key, JSON.stringify([{ t: 1, level: 'info', tag: 'old', msg: 'x' }]));
    logger.log('ai', { tag: '新日志' });
    expect(_internals.stGet(key)).toBeNull();
    expect(logger.days()).toHaveLength(1);
  });
});
