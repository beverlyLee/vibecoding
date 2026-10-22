/* ui/hooks/cardRender.ts · 卡片渲染纯函数（useGeneration / useDrafts 共用，避免循环依赖） */
import { colorEngine, compose } from '@engine';
import { config, heightFor } from '@engine/config';
import type { ResolvedParams } from '@engine/colorEngine';
import type { AppState, PhotoItem } from '@ui/store/state';
import type { TextBox } from '@engine/compose';

/* 卡片 i 实际使用的图：覆盖图优先（AI 生图/上传替换），否则按模式取共享照片 */
export function cardSubject(s: AppState, i: number): PhotoItem {
  return s.cardOverrides[i] ?? (s.mode === 'default' ? s.photos[0] : s.photos[i]);
}

/* 纯函数：从给定 state 解析渲染参数（便于用局部覆盖值调用，规避闭包过期） */
export function resolveParamsFor(s: AppState): ResolvedParams {
  return colorEngine.resolve({
    paletteId: s.selectedPalette, fontId: s.selectedFont,
    layoutId: s.selectedLayout, text: s.text,
    aiParams: null, photo: s.photoAnalysis,
  });
}

/* 统一的单卡渲染入口：只渲染图片与底色，文字由文本框叠加（导出时合并） */
export function renderCard(s: AppState, i: number, params: ResolvedParams): HTMLCanvasElement {
  config.output.height = heightFor(s.ratio); // 渲染前同步输出高度（compose.render 读 config.output）
  const subject = cardSubject(s, i);
  return compose.render({
    image: subject.img, palette: params.palette,
    layout: params.layout, tuning: params.tuning,
  });
}

/* 新文本框的默认位置：跟随版式的文字安全区中心 */
export function defaultBoxPos(layoutId: string): { x: number; y: number } {
  switch (layoutId) {
    case 'overlay': return { x: 0.5, y: 0.5 };
    case 'leftright': return { x: 0.265, y: 0.5 };
    case 'topbottom': return { x: 0.5, y: 0.85 };
    case 'circle': return { x: 0.5, y: 0.82 };
    default: return { x: 0.5, y: 0.83 }; // center
  }
}

let boxSeq = 0;
export function makeBox(text: string, params: ResolvedParams, layoutId: string): TextBox {
  const pos = defaultBoxPos(layoutId);
  return {
    id: `b${Date.now()}${(boxSeq++).toString(36)}`,
    text, x: pos.x, y: pos.y, size: 64,
    color: params.palette.text, fontId: params.font.id, align: 'center',
  };
}

/* 由文案切分结果构建每张卡的初始文本框 */
export function boxesFromSegments(segs: string[], s: AppState): Record<number, TextBox[]> {
  const params = resolveParamsFor(s);
  const map: Record<number, TextBox[]> = {};
  for (let i = 0; i < segs.length; i++) {
    const seg = (segs[i] || '').trim();
    map[i] = seg ? [makeBox(seg, params, s.selectedLayout)] : [];
  }
  return map;
}
