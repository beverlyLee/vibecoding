/* engine/analyze.ts · 主色 + 亮度/对比度提取（64×64 缩略图量化） */
import type { PhotoAnalysis } from './config';

export function analyze(image: CanvasImageSource): PhotoAnalysis {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, s, s);
  const data = ctx.getImageData(0, 0, s, s).data;

  const buckets: Record<string, number> = {};
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 16) continue;
    const key = (r >> 2) + ',' + (g >> 2) + ',' + (b >> 2);
    buckets[key] = (buckets[key] || 0) + 1;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += lum; sumSq += lum * lum; n++;
  }
  let best: string | null = null, bestC = -1;
  for (const k in buckets) {
    if (buckets[k] > bestC) { bestC = buckets[k]; best = k; }
  }
  const [br, bg, bb] = best ? best.split(',').map(Number) : [200, 200, 200];
  const dominant = [br * 4 + 2, bg * 4 + 2, bb * 4 + 2];

  const mean = n ? sum / n : 128;
  const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
  return {
    dominant,
    brightness: Math.min(1, mean / 255),
    contrast: Math.min(1, Math.sqrt(variance) / 128),
  };
}
