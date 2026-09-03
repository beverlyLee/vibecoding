/* engine/export.ts · 单卡 blob / 触发下载 / 整套 ZIP */
import { config } from './config';
import { pack } from './zip';
import type { ZipEntry } from './zip';

export function cardBlob(canvas: HTMLCanvasElement, fmt?: string, q?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, fmt || config.output.format, q ?? config.output.quality));
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function zip(canvases: HTMLCanvasElement[], fmt: string, q: number, baseName?: string): Promise<void> {
  const ext = fmt === 'image/png' ? 'png' : 'jpg';
  const name = baseName || '治愈卡片';
  const files: ZipEntry[] = [];
  for (let i = 0; i < canvases.length; i++) {
    const blob = await cardBlob(canvases[i], fmt, q);
    if (blob) files.push({ name: `${name}_${pad(i + 1)}.${ext}`, blob });
  }
  const zipBlob = await pack(files);
  download(zipBlob, `${name}_整套.zip`);
}
