/* engine/compose.ts · 版式合成：照片裁切/调色（4 种 geometry），文字由文本框叠加（drawTextBoxes） */
import { config } from './config';
import type { Palette, LayoutDef, Tuning } from './config';
import * as fontEngine from './fontEngine';

export type CardImage = HTMLImageElement | HTMLCanvasElement;

/* 超长原图预缩放，避免卡死（T7） */
export function prepareImage(img: HTMLImageElement): CardImage {
  const max = config.maxEdge;
  if (img.naturalWidth <= max && img.naturalHeight <= max) return img;
  const r = max / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r);
  c.height = Math.round(img.naturalHeight * r);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

type PhotoGeo =
  | { x: number; y: number; w: number; h: number; shape: 'rect' }
  | { cx: number; cy: number; d: number; shape: 'circle' };
interface Geo { photo: PhotoGeo; paletteAccent?: string }

/* 可拖动文本框：x/y 为相对卡片的归一化中心坐标（0-1），size 为相对输出宽度的像素字号 */
export interface TextBox {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;             // hex 或 rgba()
  fontId: string;
  align: 'left' | 'center' | 'right';
  weight?: number;           // 字重 400/500/700，缺省 400
  lineGap?: number;          // 行距倍数，缺省 BOX_LINE_GAP
  letterSpacing?: number;    // 字间距（输出像素），缺省 0
  strokeColor?: string;      // 描边颜色
  strokeWidth?: number;      // 描边宽度（输出像素），0/缺省=无
  bgColor?: string;          // 文字背景色，'' / 缺省=无
}

export const BOX_WIDTH_RATIO = 0.84;  // 文本框宽度占卡片宽度比例（绘制与预览共用）
export const BOX_LINE_GAP = 1.32;     // 文本框行距（绘制与预览共用）

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  /* 照抄 legacy/assets/js/compose.js 第 24–38 行 */
  const lines: string[] = [];
  const paras = (text || '').split('\n');
  for (const para of paras) {
    if (para === '') { lines.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = ch; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function geometry(W: number, H: number, layout: LayoutDef): Geo {
  const m = Math.round(W * 0.07);
  const top = Math.round(H * 0.07);
  const ratio = layout.photoRatio;
  if (layout.id === 'overlay') {
    // 图文叠加：照片铺满整卡，文字由文本框叠加
    return { photo: { x: 0, y: 0, w: W, h: H, shape: 'rect' } };
  }
  if (layout.id === 'leftright') {
    const pw = Math.round(W * 0.5);
    const ph = Math.round(H * ratio);
    const px = W - m - pw;
    const py = Math.round((H - ph) / 2);
    return { photo: { x: px, y: py, w: pw, h: ph, shape: 'rect' } };
  }
  if (layout.id === 'circle') {
    const d = Math.min(W - 2 * m, Math.round(H * ratio));
    const cx = W / 2, cy = top + d / 2;
    return { photo: { cx, cy, d, shape: 'circle' } };
  }
  // center / topbottom：照片置顶
  const ph = Math.round(H * ratio);
  const py = top;
  return { photo: { x: m, y: py, w: W - 2 * m, h: ph, shape: 'rect' } };
}

function drawPhoto(ctx: CanvasRenderingContext2D, src: CardImage, geo: Geo, tuning: Tuning): void {
  /* 照抄 legacy/assets/js/compose.js 第 86–137 行（geo.paletteAccent 由 render 注入，见改动③） */
  const p = geo.photo;
  ctx.save();
  if (p.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, p.d / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.filter = `brightness(${tuning.brightness}) saturate(${tuning.saturate}) contrast(${tuning.contrast})`;
  if (p.shape === 'circle') {
    const iw = (src as HTMLImageElement).naturalWidth || src.width, ih = (src as HTMLImageElement).naturalHeight || src.height;
    const s = Math.max(p.d / iw, p.d / ih);
    const sw = p.d / s, sh = p.d / s;
    ctx.drawImage(src, (iw - sw) / 2, (ih - sh) / 2, sw, sh, p.cx - p.d / 2, p.cy - p.d / 2, p.d, p.d);
  } else {
    const iw = (src as HTMLImageElement).naturalWidth || src.width, ih = (src as HTMLImageElement).naturalHeight || src.height;
    const s = Math.max(p.w / iw, p.h / ih);
    const sw = p.w / s, sh = p.h / s;
    ctx.drawImage(src, (iw - sw) / 2, (ih - sh) / 2, sw, sh, p.x, p.y, p.w, p.h);
  }
  ctx.filter = 'none';
  ctx.restore();

  // 主色叠层（overlay 柔光感）
  if (tuning.overlay > 0) {
    ctx.save();
    if (p.shape === 'circle') {
      ctx.beginPath(); ctx.arc(p.cx, p.cy, p.d / 2, 0, Math.PI * 2); ctx.clip();
    }
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = tuning.overlay;
    ctx.fillStyle = geo.paletteAccent!;
    if (p.shape === 'circle') ctx.fillRect(p.cx - p.d / 2, p.cy - p.d / 2, p.d, p.d);
    else ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();
  }
  // 暗角
  if (tuning.vignette > 0) {
    ctx.save();
    let rx: number, ry: number, rw: number, rh: number;
    if (p.shape === 'circle') { rx = p.cx - p.d / 2; ry = p.cy - p.d / 2; rw = rh = p.d; }
    else { rx = p.x; ry = p.y; rw = p.w; rh = p.h; }
    const g = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.35,
      rx + rw / 2, ry + rh / 2, Math.max(rw, rh) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(40,30,20,${tuning.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }
}

export interface RenderOpts {
  image: CardImage; palette: Palette; layout: LayoutDef; tuning: Tuning;
}

export function render(opts: RenderOpts): HTMLCanvasElement {
  const W = config.output.width, H = config.output.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.palette.base;
  ctx.fillRect(0, 0, W, H);

  const geo = geometry(W, H, opts.layout);
  geo.paletteAccent = opts.palette.accent;
  drawPhoto(ctx, opts.image, geo, opts.tuning);
  return canvas;
}

/* 导出用：把文本框合并进卡片画布（返回新画布，不改原图） */
export function drawTextBoxes(src: HTMLCanvasElement, boxes: TextBox[]): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const W = out.width, H = out.height;
  const blockW = W * BOX_WIDTH_RATIO;

  for (const b of boxes) {
    if (!b.text || !b.text.trim()) continue;
    const size = (b.size / config.output.width) * W;
    const gap = b.lineGap ?? BOX_LINE_GAP;
    ctx.font = `${b.weight ?? 400} ${size}px ${fontEngine.family(b.fontId)}`;
    try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${b.letterSpacing ?? 0}px`; } catch { /* 旧浏览器忽略 */ }
    const lines = wrapText(ctx, b.text, blockW);
    const lineH = size * gap;
    const totalH = lines.length * lineH;
    const cx = b.x * W, cy = b.y * H;
    let y = cy - totalH / 2;
    ctx.textBaseline = 'top';
    ctx.textAlign = b.align;
    const ax = b.align === 'center' ? cx : b.align === 'left' ? cx - blockW / 2 : cx + blockW / 2;
    // 文字背景：横跨整个文本块宽度，纵向包住所有行（与预览 DOM 一致）
    if (b.bgColor) {
      const padY = size * 0.12;
      const r = size * 0.25;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = b.bgColor;
      ctx.beginPath();
      const rr = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, yy: number, w: number, h: number, radii: number) => void };
      if (typeof rr.roundRect === 'function') rr.roundRect(cx - blockW / 2, cy - totalH / 2 - padY, blockW, totalH + padY * 2, r);
      else ctx.rect(cx - blockW / 2, cy - totalH / 2 - padY, blockW, totalH + padY * 2);
      ctx.fill();
      ctx.restore();
    }
    // 柔和阴影保证文字压在照片上也可读
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = Math.round(W * 0.01);
    ctx.shadowOffsetY = 2;
    for (const line of lines) {
      if (b.strokeWidth && b.strokeColor) {
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = b.strokeWidth;
        ctx.strokeStyle = b.strokeColor;
        ctx.strokeText(line, ax, y);
      }
      ctx.fillStyle = b.color;
      ctx.fillText(line, ax, y);
      y += lineH;
    }
  }
  return out;
}
