/* engine/splitEngine.ts · 文案切分：一段文案 → N 段（D3），句数不足按字符均分 */

export function splitSentences(text: string): string[] {
  const t = (text || '').replace(/\r/g, '');
  const parts = t.split(/(?<=[。！？!?；;\n])/).map(s => s.trim()).filter(s => s.length);
  return parts.length ? parts : (t.trim() ? [t.trim()] : []);
}

export function split(text: string, N: number): string[] {
  const n = Math.max(1, N | 0);
  if (!text || !text.trim()) return new Array(n).fill('');

  const parts = splitSentences(text);
  if (parts.length >= n) {
    // 带余量分配：每段至少一句，避免末段为空（如 4 句切 3 卡 → 2/1/1）
    const base = Math.floor(parts.length / n);
    const rem = parts.length % n;
    const res: string[] = [];
    let i = 0;
    for (let s = 0; s < n; s++) {
      const take = base + (s < rem ? 1 : 0);
      res.push(parts.slice(i, i + take).join(''));
      i += take;
    }
    return res;
  }
  const whole = parts.join('');
  const size = Math.ceil(whole.length / n);
  const res: string[] = [];
  for (let i = 0; i < n; i++) res.push(whole.slice(i * size, (i + 1) * size));
  return res;
}
