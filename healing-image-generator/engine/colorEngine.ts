/* engine/colorEngine.ts · 情绪/AI → 色板 + 字体 + 调色参数（F3 自动选板） */
import { config } from './config';
import type { Palette, FontDef, LayoutDef, PhotoAnalysis, AiParams, Tuning } from './config';

export function byId<T extends { id: string }>(list: T[], id: string): T {
  return list.find(x => x.id === id) || list[0];
}

export function pickFontByMood(text: string): string {
  const t = text || '';
  let best: string | null = null, bestScore = 0;
  for (const rule of config.moodRules) {
    let score = 0;
    for (const w of rule.words) if (t.indexOf(w) >= 0) score++;
    if (score > bestScore) { bestScore = score; best = rule.font; }
  }
  return best || 'noto';
}

/* 把照片分析结果归约为语义标签：warm/cool/rosy/bright/dark */
export function photoTags(photo: PhotoAnalysis | null): Set<string> {
  const tags = new Set<string>();
  if (!photo) return tags;
  const b = typeof photo.brightness === 'number' ? photo.brightness : 0.5;
  if (b >= 0.6) tags.add('bright');
  if (b < 0.4) tags.add('dark');
  const d = Array.isArray(photo.dominant) ? photo.dominant : [200, 200, 200];
  const [r, g, bl] = d;
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
  const warmth = r - bl;
  if (warmth > 15) tags.add('warm');
  if (warmth < -15) tags.add('cool');
  if (warmth > 5 && r === max && g <= bl) tags.add('rosy');
  if (!tags.has('warm') && !tags.has('cool') && max - min > 40) {
    tags.add(warmth >= 0 ? 'warm' : 'cool');
  }
  return tags;
}

export function scorePalette(paletteId: string, text: string, photo: PhotoAnalysis | null): number {
  let s = 0;
  const t = text || '';
  for (const rule of config.moodRules) {
    if (rule.palette !== paletteId) continue;
    for (const w of rule.words) if (t.indexOf(w) >= 0) s++;
  }
  if (photo) {
    const tags = photoTags(photo);
    for (const rule of config.photoMoodRules) {
      if (rule.palette !== paletteId) continue;
      for (const tw of rule.tags || rule.words || []) {
        const tag = Array.isArray(tw) ? tw[0] : tw;
        const w = Array.isArray(tw) ? tw[1] || 1 : 1;
        if (tags.has(tag)) s += w;
      }
    }
  }
  return s;
}

export function pickPaletteAuto(text: string, photo: PhotoAnalysis | null): string {
  let best = config.palettes[0].id, bestScore = -1;
  for (const p of config.palettes) {
    const s = scorePalette(p.id, text, photo);
    if (s > bestScore) { bestScore = s; best = p.id; }
  }
  return best;
}

export interface ResolveOpts {
  paletteId: string | null;
  fontId: string;
  layoutId: string;
  text: string;
  aiParams: AiParams | null;
  photo: PhotoAnalysis | null;
}
export interface ResolvedParams {
  palette: Palette; font: FontDef; layout: LayoutDef; tuning: Tuning;
}

export function resolve(opts: ResolveOpts): ResolvedParams {
  const paletteId = opts.paletteId == null || opts.paletteId === 'auto'
    ? pickPaletteAuto(opts.text, opts.photo)
    : opts.paletteId;
  const palette = byId(config.palettes, paletteId);
  let fontId = opts.fontId;
  if (!fontId || fontId === 'auto') fontId = pickFontByMood(opts.text);
  const font = byId(config.fonts, fontId);
  const layout = byId(config.layouts, opts.layoutId);
  const tuning: Tuning = Object.assign({}, palette.tuning);
  if (opts.aiParams && opts.aiParams.tuning) Object.assign(tuning, opts.aiParams.tuning);
  return { palette, font, layout, tuning };
}
