/* engine/fontEngine.ts · FontFace 预载 + 系统兜底；永不阻塞出图（T9） */
import { config } from './config';
import type { FontDef } from './config';

const FAMILY_NAME: Record<string, string> = { noto: 'Noto Sans SC', wenkai: 'LXGW WenKai', kuai: 'ZCOOL KuaiLe' };
const loaded: Record<string, boolean> = {};

function loadOne(f: FontDef, assetBase: string): Promise<boolean> {
  if (!f.src) return Promise.resolve(false);
  const name = FAMILY_NAME[f.id];
  if (!name) return Promise.resolve(false);
  try {
    const ff = new FontFace(name, `url(${assetBase}${f.src})`);
    return ff.load()
      .then(() => { document.fonts.add(ff); loaded[f.id] = true; return true; })
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/* assetBase 由 UI 层传入（如 import.meta.env.BASE_URL），engine 不读环境变量 */
export function init(assetBase = ''): Promise<void> {
  const real = config.fonts.filter(f => f.id !== 'auto');
  return Promise.all(real.map(f => loadOne(f, assetBase)))
    .then(() => document.fonts.ready)
    .then(() => undefined);
}

/* 返回用于 ctx.font 的 CSS 字体族字符串（含系统回退） */
export function family(fontId: string): string {
  const f = config.fonts.find(x => x.id === fontId);
  if (!f || !f.family) return '"PingFang SC","Microsoft YaHei",sans-serif';
  return f.family;
}

export function isLoaded(fontId: string): boolean {
  return !!loaded[fontId];
}
