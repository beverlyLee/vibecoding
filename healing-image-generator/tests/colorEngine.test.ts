import { describe, it, expect } from 'vitest';
import { config } from '../engine/config';
import {
  byId, pickFontByMood, photoTags, scorePalette, pickPaletteAuto, resolve,
} from '../engine/colorEngine';

describe('pickFontByMood', () => {
  it('「晚安」命中 sakura 规则 → wenkai', () => {
    expect(pickFontByMood('晚安，世界')).toBe('wenkai');
  });
  it('无命中回退 noto', () => {
    expect(pickFontByMood('随便写写')).toBe('noto');
  });
});

describe('photoTags', () => {
  it('典型粉调 → rosy + warm', () => {
    const tags = photoTags({ dominant: [220, 120, 140], brightness: 0.6, contrast: 0.3 });
    expect(tags.has('rosy')).toBe(true);
    expect(tags.has('warm')).toBe(true);
  });
  it('偏冷偏暗 → cool + dark', () => {
    const tags = photoTags({ dominant: [80, 100, 160], brightness: 0.3, contrast: 0.3 });
    expect(tags.has('cool')).toBe(true);
    expect(tags.has('dark')).toBe(true);
  });
  it('photo 为空返回空集合', () => {
    expect(photoTags(null).size).toBe(0);
  });
});

describe('scorePalette（F3 核心差异点）', () => {
  it('亮粉照片：rosy(3) 使 sakura 胜过 cream 的 warm+bright(2)', () => {
    const photo = { dominant: [235, 160, 175], brightness: 0.7, contrast: 0.3 };
    expect(scorePalette('sakura', '', photo)).toBe(3);
    expect(scorePalette('cream', '', photo)).toBe(2);
  });
});

describe('pickPaletteAuto', () => {
  it('粉调照片自动选中 sakura', () => {
    const photo = { dominant: [235, 160, 175], brightness: 0.7, contrast: 0.3 };
    expect(pickPaletteAuto('', photo)).toBe('sakura');
  });
  it('无信号时平局按色板表顺序取第一个', () => {
    expect(pickPaletteAuto('', null)).toBe('cream');
  });
});

describe('resolve', () => {
  it('手动色板优先级最高，不走打分', () => {
    const r = resolve({ paletteId: 'mistblue', fontId: 'auto', layoutId: 'center', text: '晚安', aiParams: null, photo: null });
    expect(r.palette.id).toBe('mistblue');
    expect(r.font.id).toBe('wenkai'); // 字体仍按情绪自动
  });
  it('AI tuning 浅合并覆盖色板预设', () => {
    const r = resolve({
      paletteId: 'cream', fontId: 'noto', layoutId: 'center', text: '',
      aiParams: { palette: null, font: null, layout: null, tuning: { brightness: 1.5 } }, photo: null,
    });
    expect(r.tuning.brightness).toBe(1.5);
    expect(r.tuning.vignette).toBe(0.18); // 未覆盖项保留色板预设
  });
  it('byId 找不到 id 时回退首项', () => {
    expect(byId(config.palettes, '不存在').id).toBe('cream');
  });
});
