# 治愈系图片生成器 · React + Vite 工程化重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旧版零构建静态站点迁移为 Vite + React 18 + TypeScript 工程，engine/（纯 TS 引擎层）与 ui/（React 组件层）双目录分离，功能与视觉与旧版完全一致。

**Architecture:** 单向数据流：React 组件 dispatch action → useReducer Store → 状态驱动 UI；引擎层为框架无关纯 TS 模块，只被 UI 层引用；Canvas 不进 React 渲染树（经 ref 直挂）。spec 见 `docs/superpowers/specs/2026-09-01-healing-generator-react-refactor-design.md`。

**Tech Stack:** Vite 5、React 18、TypeScript 5（strict）、vitest（仅引擎单测）。

**源码参考：** 旧版代码在 Task 0 后位于 `legacy/assets/js/*.js` 与 `legacy/index.html`，迁移任务中的「逻辑原样保留」均指照抄对应行区间、仅按本计划添加类型与改导出方式。

---

### Task 0: 旧版归档到 legacy/

**Files:**
- Move: `index.html` → `legacy/index.html`
- Move: `assets/` → `legacy/assets/`
- Move: `diagram/` → `legacy/diagram/`
- Move: `QA验收报告.md`、`README.md`、`治愈系图片生成器_技术文档.md` → `legacy/`

- [ ] **Step 1: git mv 归档**

```bash
mkdir -p legacy
git mv index.html assets diagram QA验收报告.md README.md 治愈系图片生成器_技术文档.md legacy/
git commit -m "chore: 旧版零构建站点归档到 legacy/"
```

- [ ] **Step 2: 验证**

Run: `ls` → 根目录只剩 `legacy/`、`.workbuddy/`、`docs/`。旧版仍可双击 `legacy/index.html` 运行（相对路径未变）。

---

### Task 1: Vite + React + TS 脚手架

**Files:**
- Create: `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`.gitignore`
- Create: `public/fonts/`（从 legacy 拷贝两个 woff2）

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "healing-image-generator",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 写 vite.config.ts**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./engine', import.meta.url)),
      '@ui': fileURLToPath(new URL('./ui', import.meta.url)),
    },
  },
  test: { environment: 'node' },
});
```

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@engine/*": ["engine/*"], "@ui/*": ["ui/*"] }
  },
  "include": ["engine", "ui", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4: 写 index.html（根目录，Vite 入口）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>治愈系图片生成器</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/ui/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: 写 .gitignore 并拷贝字体**

```
node_modules/
dist/
```

```bash
mkdir -p public/fonts
cp legacy/assets/fonts/NotoSansSC.woff2 legacy/assets/fonts/ZCOOLKuaiLe.woff2 public/fonts/
```

- [ ] **Step 6: 安装依赖并冒烟**

Run: `npm install` → 成功；`npm run dev` → 输出 `Local: http://localhost:5173/`（页面暂白屏属预期，Task 10 才有 UI）。Ctrl+C 停止。

- [ ] **Step 7: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html .gitignore public/ package-lock.json
git commit -m "chore: Vite + React + TS 脚手架（@engine/@ui 别名）"
```

---

### Task 2: engine/config.ts — 领域类型 + 全配置

**Files:**
- Create: `engine/config.ts`（迁移自 `legacy/assets/js/config.js`）

- [ ] **Step 1: 写 engine/config.ts**

类型全部集中在此文件（spec §2 分层纪律），配置值从 legacy/config.js 原样照抄，仅两处改动：`window.HealConfig =` 改为 `export const config: AppConfig =`；fonts 的 `src` 去掉 `assets/` 前缀（字体现位于 `public/fonts/`）。

```ts
/* engine/config.ts · 配置层：色板/字体/版式/调优/情绪规则/AI prompt（D7 全配置化） */

export interface Tuning {
  brightness: number; saturate: number; contrast: number; overlay: number; vignette: number;
}
export interface Palette {
  id: string; name: string; base: string; accent: string; text: string; subtext: string; tuning: Tuning;
}
export interface FontDef { id: string; name: string; family: string; src: string | null }
export interface LayoutDef { id: string; name: string; photoRatio: number; textAlign: 'center' | 'left' }
export interface MoodRule { palette: string; font: string; words: string[] }
export type TagWeight = [string, number];
export interface PhotoMoodRule { palette: string; tags?: TagWeight[]; words?: string[] }
export interface AiSettings { enabled: boolean; endpoint: string; apiKey: string; model: string }
export interface AiParams {
  palette: string | null; font: string | null; layout: string | null; tuning: Partial<Tuning> | null;
}
/* analyze() 产物：主色 + 亮度/对比度（PRD F3 自动色板依据） */
export interface PhotoAnalysis { dominant: number[]; brightness: number; contrast: number }

export interface AppConfig {
  output: { width: number; height: number; format: string; quality: number; pngFallback: string };
  maxEdge: number;
  input: { accept: string[]; maxFileSize: number; maxCards: number };
  palettes: Palette[];
  fonts: FontDef[];
  layouts: LayoutDef[];
  moodRules: MoodRule[];
  photoMoodRules: PhotoMoodRule[];
  type: { titleRatio: number; subRatio: number; minTitle: number; maxTitle: number; lineGap: number };
  ai: { system: string; user: string };
}

export const config: AppConfig = {
  output: { width: 1080, height: 1350, format: 'image/jpeg', quality: 0.92, pngFallback: 'image/png' },
  maxEdge: 2000,
  input: { accept: ['image/jpeg', 'image/png', 'image/webp'], maxFileSize: 10 * 1024 * 1024, maxCards: 9 },
  palettes: [
    {
      id: 'cream', name: '奶油暖阳', base: '#FBF3E4', accent: '#F4B183', text: '#5C4632', subtext: '#7A6552',
      tuning: { brightness: 1.06, saturate: 0.9, contrast: 0.97, overlay: 0.12, vignette: 0.18 },
    },
    {
      id: 'sakura', name: '晚樱粉', base: '#FBEFF1', accent: '#F2C6D0', text: '#5A3A40', subtext: '#8A6470',
      tuning: { brightness: 1.04, saturate: 0.85, contrast: 0.98, overlay: 0.14, vignette: 0.16 },
    },
    {
      id: 'mistblue', name: '雾霭蓝', base: '#EAF1F5', accent: '#A9C7D9', text: '#33484F', subtext: '#5C727E',
      tuning: { brightness: 1.03, saturate: 0.82, contrast: 1.0, overlay: 0.1, vignette: 0.2 },
    },
  ],
  fonts: [
    { id: 'auto', name: '自动', family: '', src: null },
    {
      id: 'noto', name: '思源黑体',
      family: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif',
      src: 'fonts/NotoSansSC.woff2',
    },
    {
      id: 'wenkai', name: '霞鹜文楷',
      family: '"LXGW WenKai", "Songti SC", "STSong", "SimSun", "Noto Sans SC", serif',
      src: 'fonts/LXGWWenKai.woff2', // 未内置，加载失败自动回退系统衬线
    },
    {
      id: 'kuai', name: '站酷快乐体',
      family: '"ZCOOL KuaiLe", "Yuanti SC", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
      src: 'fonts/ZCOOLKuaiLe.woff2',
    },
  ],
  layouts: [
    { id: 'center', name: '居中留白', photoRatio: 0.62, textAlign: 'center' },
    { id: 'leftright', name: '左文右图', photoRatio: 0.62, textAlign: 'left' },
    { id: 'topbottom', name: '上下分栏', photoRatio: 0.66, textAlign: 'center' },
    { id: 'circle', name: '圆形裁切', photoRatio: 0.58, textAlign: 'center' },
  ],
  moodRules: [
    { palette: 'sakura', font: 'wenkai', words: ['喜欢', '想你', '温柔', '抱抱', '爱', '晚安', '心', '软'] },
    { palette: 'cream', font: 'kuai', words: ['阳光', '开心', '周末', '旅行', '快乐', '笑', '元气', '美好'] },
    { palette: 'mistblue', font: 'noto', words: ['安静', '独处', '夜', '沉思', '风', '孤独', '慢', '时间'] },
  ],
  /* rosy 权重(3) > bright+warm 之和(2)，保证亮粉照片稳定命中晚樱粉（F3 核心差异点） */
  photoMoodRules: [
    { palette: 'cream', tags: [['warm', 1], ['bright', 1]] },
    { palette: 'sakura', tags: [['rosy', 3]] },
    { palette: 'mistblue', tags: [['cool', 1], ['dark', 1]] },
  ],
  type: { titleRatio: 0.052, subRatio: 0.038, minTitle: 30, maxTitle: 68, lineGap: 1.32 },
  ai: {
    system:
      '你是治愈系图片排版助手。依据用户提供的照片与文案，判断最合适的氛围，' +
      '从给定选项中挑选色板、字体、版式，并给出轻微调色参数。只返回 JSON，不要解释。',
    user:
      '可选色板: {paletteIds}；可选字体: {fontIds}；可选版式: {layoutIds}。\n' +
      '文案: 「{text}」\n' +
      '请返回 JSON: {"palette":"id","font":"id","layout":"id",' +
      '"tuning":{"brightness":1.0,"saturate":1.0,"contrast":1.0,"overlay":0.12,"vignette":0.18}}。',
  },
};
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit` → 通过（0 错误）。

- [ ] **Step 3: Commit**

```bash
git add engine/config.ts
git commit -m "feat(engine): 领域类型 + 全配置迁移（config.ts）"
```

---

### Task 3: engine/splitEngine.ts（TDD）

**Files:**
- Create: `engine/splitEngine.ts`
- Test: `tests/splitEngine.test.ts`

- [ ] **Step 1: 写失败测试 tests/splitEngine.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { split, splitSentences } from '../engine/splitEngine';

describe('splitSentences', () => {
  it('按句号切分并保留标点', () => {
    expect(splitSentences('你好。世界！')).toEqual(['你好。', '世界！']);
  });
  it('换行视为断句', () => {
    expect(splitSentences('第一行\n第二行')).toEqual(['第一行', '第二行']);
  });
  it('无标点整段返回', () => {
    expect(splitSentences('没有标点的一段话')).toEqual(['没有标点的一段话']);
  });
  it('空字符串返回空数组', () => {
    expect(splitSentences('')).toEqual([]);
  });
});

describe('split', () => {
  it('空文案返回 N 个空串（T3）', () => {
    expect(split('   ', 3)).toEqual(['', '', '']);
  });
  it('句数充足：顺序分桶', () => {
    expect(split('一。二。三。四。', 2)).toEqual(['一。二。', '三。四。']);
  });
  it('句数不足：按字符均分', () => {
    expect(split('晚安', 2)).toEqual(['晚', '安']);
  });
  it('N 小于 1 按 1 处理', () => {
    expect(split('你好。', 0)).toEqual(['你好。']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/splitEngine.test.ts`
Expected: FAIL（`Cannot find module '../engine/splitEngine'`）。

- [ ] **Step 3: 写 engine/splitEngine.ts（逻辑照抄 legacy/assets/js/splitEngine.js 第 11–38 行）**

```ts
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
    const res = new Array(n).fill('');
    const size = Math.ceil(parts.length / n);
    for (let i = 0; i < n; i++) {
      res[i] = parts.slice(i * size, (i + 1) * size).join('');
    }
    return res;
  }
  const whole = parts.join('');
  const size = Math.ceil(whole.length / n);
  const res: string[] = [];
  for (let i = 0; i < n; i++) res.push(whole.slice(i * size, (i + 1) * size));
  return res;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/splitEngine.test.ts`
Expected: 8 passed。

- [ ] **Step 5: Commit**

```bash
git add engine/splitEngine.ts tests/splitEngine.test.ts
git commit -m "feat(engine): 文案切分引擎迁移 + 单测"
```

---

### Task 4: engine/colorEngine.ts（TDD）

**Files:**
- Create: `engine/colorEngine.ts`
- Test: `tests/colorEngine.test.ts`

- [ ] **Step 1: 写失败测试 tests/colorEngine.test.ts**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/colorEngine.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 engine/colorEngine.ts（逻辑照抄 legacy/assets/js/colorEngine.js 第 11–102 行）**

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/colorEngine.test.ts`
Expected: 11 passed。

- [ ] **Step 5: Commit**

```bash
git add engine/colorEngine.ts tests/colorEngine.test.ts
git commit -m "feat(engine): 情绪匹配引擎迁移 + 单测（F3 rosy 优先验证）"
```

---

### Task 5: engine/zip.ts（TDD）

**Files:**
- Create: `engine/zip.ts`
- Test: `tests/zip.test.ts`

- [ ] **Step 1: 写失败测试 tests/zip.test.ts**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/zip.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 engine/zip.ts（逻辑照抄 legacy/assets/js/zip.js 第 11–108 行；删除未使用的 strBytes）**

```ts
/* engine/zip.ts · 零依赖 ZIP 打包（store 模式 + UTF-8 中文名，general purpose bit 11） */

export interface ZipEntry { name: string; blob: Blob }

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function pack(files: ZipEntry[]): Promise<Blob> {
  return Promise.all(files.map(f => f.blob.arrayBuffer().then(b => new Uint8Array(b))))
    .then(buffers => {
      const enc = new TextEncoder();
      const locals: Uint8Array[] = [];
      const centrals: Uint8Array[] = [];
      let offset = 0;
      const UTF8_FLAG = 0x0800;

      files.forEach((f, i) => {
        const nameBytes = enc.encode(f.name);
        const data = buffers[i];
        const crc = crc32(data);

        const lh = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, UTF8_FLAG, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0x21, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        lh.set(nameBytes, 30);
        locals.push(lh, data);

        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, UTF8_FLAG, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0x21, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        centrals.push(ch);

        offset += lh.length + data.length;
      });

      const cdSize = centrals.reduce((s, c) => s + c.length, 0);
      const cdOffset = offset;

      const eo = new Uint8Array(22);
      const ev = new DataView(eo.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, files.length, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, cdOffset, true);
      ev.setUint16(20, 0, true);

      return new Blob([...locals, ...centrals, eo], { type: 'application/zip' });
    });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/zip.test.ts`
Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add engine/zip.ts tests/zip.test.ts
git commit -m "feat(engine): 零依赖 ZIP 迁移 + CRC32/结构单测"
```

---

### Task 6: engine/analyze.ts + engine/compose.ts（类型迁移）

**Files:**
- Create: `engine/analyze.ts`（迁移自 `legacy/assets/js/analyze.js`）
- Create: `engine/compose.ts`（迁移自 `legacy/assets/js/compose.js`）

这两个文件依赖 Canvas/Image API，按 spec 只做手动验证，不写单测。

- [ ] **Step 1: 写 engine/analyze.ts（逻辑照抄 legacy/assets/js/analyze.js 第 10–43 行，仅改导出）**

```ts
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
```

- [ ] **Step 2: 写 engine/compose.ts**

逻辑照抄 legacy/assets/js/compose.js 第 13–181 行，改动仅 4 处（均已标注）：

```ts
/* engine/compose.ts · 版式合成：照片裁切/调色/文案排版（4 种 geometry） */
import { config } from './config';
import type { Palette, FontDef, LayoutDef, Tuning } from './config';
import * as fontEngine from './fontEngine'; // 改动①：原 window.Heal.fontEngine → 模块内 import

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

interface TextGeo { x: number; y: number; w: number; h: number; align: 'center' | 'left' }
type PhotoGeo =
  | { x: number; y: number; w: number; h: number; shape: 'rect' }
  | { cx: number; cy: number; d: number; shape: 'circle' };
interface Geo { photo: PhotoGeo; text: TextGeo; paletteAccent?: string }

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  /* 照抄 legacy/assets/js/compose.js 第 24–38 行 */
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, areaH: number,
  family: string, baseSize: number, minSize: number, lineGap: number): { size: number; lines: string[] } {
  /* 照抄 legacy/assets/js/compose.js 第 40–50 行 */
}

function geometry(W: number, H: number, layout: LayoutDef): Geo {
  /* 照抄 legacy/assets/js/compose.js 第 52–84 行 */
}

function drawPhoto(ctx: CanvasRenderingContext2D, src: CardImage, geo: Geo, tuning: Tuning): void {
  /* 照抄 legacy/assets/js/compose.js 第 86–137 行（geo.paletteAccent 由 render 注入，见改动③） */
}

function drawText(ctx: CanvasRenderingContext2D, geo: Geo, text: string, palette: Palette, family: string): void {
  /* 照抄 legacy/assets/js/compose.js 第 139–162 行 */
}

export interface RenderOpts {
  image: CardImage; palette: Palette; font: FontDef; layout: LayoutDef; tuning: Tuning; text: string;
}

export function render(opts: RenderOpts): HTMLCanvasElement {
  const W = config.output.width, H = config.output.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.palette.base;
  ctx.fillRect(0, 0, W, H);

  const geo = geometry(W, H, opts.layout);
  geo.paletteAccent = opts.palette.accent; // 改动③：Geo 接口补 paletteAccent 可选字段
  drawPhoto(ctx, opts.image, geo, opts.tuning);
  drawText(ctx, geo, opts.text, opts.palette, fontEngine.family(opts.font.id)); // 改动④：CFG.type 常量已在 drawText 内经 config 引用
  return canvas;
}
```

注意：`wrapText / fitText / geometry / drawPhoto / drawText` 五个内部函数体**逐行照抄** legacy 对应行区间，把 `CFG.type.*` / `CFG.output.*` 替换为 `config.type.*` / `config.output.*`，参数与局部变量补上上述类型标注（`const lines: string[] = []` 等），无其他改动。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过（fontEngine 尚未创建会报错，可与 Task 7 一起检查；若报 `fontEngine` 缺失则先完成 Task 7 Step 1 再检查）。

- [ ] **Step 4: Commit**

```bash
git add engine/analyze.ts engine/compose.ts
git commit -m "feat(engine): 主色分析与 Canvas 合成迁移（类型化）"
```

---

### Task 7: engine/fontEngine.ts + export.ts + aiBridge.ts + index.ts 出口

**Files:**
- Create: `engine/fontEngine.ts`、`engine/export.ts`、`engine/aiBridge.ts`、`engine/index.ts`

- [ ] **Step 1: 写 engine/fontEngine.ts（逻辑照抄 legacy/assets/js/fontEngine.js 第 10–38 行）**

改动：字体 URL 由调用方注入 base（spec §5：engine 不读 import.meta.env）。

```ts
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
```

- [ ] **Step 2: 写 engine/export.ts（逻辑照抄 legacy/assets/js/export.js 第 12–38 行）**

```ts
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
```

- [ ] **Step 3: 写 engine/aiBridge.ts（逻辑照抄 legacy/assets/js/aiBridge.js 第 11–69 行）**

```ts
/* engine/aiBridge.ts · 可选 AI 调参：仅发往用户自配 endpoint；失败/超时回退 null（T16） */
import { config } from './config';
import type { AiSettings, AiParams } from './config';

function buildUser(text: string): string {
  const paletteIds = config.palettes.map(p => p.id).join(', ');
  const fontIds = config.fonts.map(f => f.id).join(', ');
  const layoutIds = config.layouts.map(l => l.id).join(', ');
  return config.ai.user
    .replace('{paletteIds}', paletteIds)
    .replace('{fontIds}', fontIds)
    .replace('{layoutIds}', layoutIds)
    .replace('{text}', text || '');
}

function extractJSON(content: unknown): Record<string, unknown> | null {
  if (typeof content !== 'string') return null;
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s < 0 || e < 0) return null;
  try { return JSON.parse(content.slice(s, e + 1)); } catch { return null; }
}

interface ChatResponse {
  choices?: { message?: { content?: unknown } }[];
  content?: unknown;
}

export async function analyze(text: string, imageDataUrl: string, settings: AiSettings): Promise<AiParams | null> {
  if (!settings || !settings.enabled) return null;
  if (!settings.endpoint || !settings.apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const messages = [
      { role: 'system', content: config.ai.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: buildUser(text) },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ];
    const resp = await fetch(settings.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.model || 'gpt-4o', messages }),
      signal: controller.signal,
    });
    const data = (await resp.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content ?? data.content;
    const p = extractJSON(content);
    if (!p) return null;
    return {
      palette: config.palettes.some(x => x.id === p.palette) ? (p.palette as string) : null,
      font: config.fonts.some(x => x.id === p.font) ? (p.font as string) : null,
      layout: config.layouts.some(x => x.id === p.layout) ? (p.layout as string) : null,
      tuning: p.tuning && typeof p.tuning === 'object' ? (p.tuning as AiParams['tuning']) : null,
    };
  } catch {
    return null; // 降级固定预设
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: 写 engine/index.ts 统一出口**

```ts
export * from './config';
export * as colorEngine from './colorEngine';
export * as analyzeEngine from './analyze';
export * as fontEngine from './fontEngine';
export * as splitEngine from './splitEngine';
export * as compose from './compose';
export * as exporter from './export';
export * as zip from './zip';
export * as aiBridge from './aiBridge';
```

- [ ] **Step 5: 类型检查 + 全部单测**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc 通过；vitest 汇总 21 passed（8+11+2）。

- [ ] **Step 6: Commit**

```bash
git add engine/
git commit -m "feat(engine): 字体/导出/AI 桥迁移 + engine 统一出口，引擎层完成"
```

---

### Task 8: ui/store — state / reducer / AppContext

**Files:**
- Create: `ui/store/state.ts`、`ui/store/reducer.ts`、`ui/store/AppContext.tsx`

- [ ] **Step 1: 写 ui/store/state.ts**

```ts
import type { AiParams, AiSettings, PhotoAnalysis } from '@engine/config';

export type Mode = 'default' | 'multi';

export interface PhotoItem {
  file: File;
  url: string;              // ObjectURL（缩略图用，卸载时 revoke）
  img: HTMLImageElement | HTMLCanvasElement; // prepareImage 后的合成用图
  dataUrl: string;          // 512px 缩略 dataURL（AI 模式发往用户 endpoint）
  raw: HTMLImageElement;    // 原图（analyze 用）
}

export interface ToastItem { id: number; msg: string; kind?: 'ok' | 'err' }

export interface UiState { settingsOpen: boolean; helpOpen: boolean }

export interface AppState {
  mode: Mode;
  n: number;
  photos: PhotoItem[];
  text: string;
  selectedPalette: string;  // 'auto' | paletteId
  selectedFont: string;     // 'auto' | fontId
  selectedLayout: string;
  aiSettings: AiSettings;
  cardsText: string[] | null;
  aiParams: AiParams | null;
  photoAnalysis: PhotoAnalysis | null;
  cards: HTMLCanvasElement[] | null;
  loading: boolean;
  editIndex: number;
  ui: UiState;
  toasts: ToastItem[];
}

const LS_KEY = 'heal.aiSettings';

function loadAiSettings(): AiSettings {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return { enabled: false, endpoint: '', apiKey: '', model: '', ...JSON.parse(s) };
  } catch { /* 忽略损坏数据 */ }
  return { enabled: false, endpoint: '', apiKey: '', model: '' };
}

export function saveAiSettings(s: AiSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* 隐私模式忽略 */ }
}

export const initialState: AppState = {
  mode: 'default',
  n: 3,
  photos: [],
  text: '',
  selectedPalette: 'auto',
  selectedFont: 'auto',
  selectedLayout: 'center',
  aiSettings: loadAiSettings(),
  cardsText: null,
  aiParams: null,
  photoAnalysis: null,
  cards: null,
  loading: false,
  editIndex: -1,
  ui: { settingsOpen: false, helpOpen: false },
  toasts: [],
};
```

- [ ] **Step 2: 写 ui/store/reducer.ts**

```ts
import { config } from '@engine/config';
import { initialState } from './state';
import type { AppState, Mode, PhotoItem, ToastItem, UiState } from './state';
import type { AiParams, AiSettings, PhotoAnalysis } from '@engine/config';

export type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_N'; n: number }
  | { type: 'SET_TEXT'; text: string }
  | { type: 'ADD_PHOTOS'; photos: PhotoItem[] }
  | { type: 'REMOVE_PHOTO'; index: number }
  | { type: 'SELECT_PALETTE'; id: string }
  | { type: 'SELECT_FONT'; id: string }
  | { type: 'SELECT_LAYOUT'; id: string }
  | { type: 'SET_AI_SETTINGS'; settings: AiSettings }
  | { type: 'SET_CARDS_TEXT'; cardsText: string[] | null }
  | { type: 'SET_AI_PARAMS'; aiParams: AiParams | null }
  | { type: 'SET_PHOTO_ANALYSIS'; analysis: PhotoAnalysis | null }
  | { type: 'SET_CARDS'; cards: HTMLCanvasElement[] | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'OPEN_EDIT'; index: number }
  | { type: 'CLOSE_EDIT' }
  | { type: 'SET_UI'; ui: Partial<UiState> }
  | { type: 'TOAST'; toast: ToastItem }
  | { type: 'DISMISS_TOAST'; id: number };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_N':
      return { ...state, n: Math.min(config.input.maxCards, Math.max(1, action.n)) };
    case 'SET_TEXT':
      return { ...state, text: action.text };
    case 'ADD_PHOTOS':
      // 默认模式只保留第一张作为主体（对齐旧 addFiles 行为）
      return { ...state, photos: state.mode === 'default' ? action.photos.slice(0, 1) : [...state.photos, ...action.photos] };
    case 'REMOVE_PHOTO':
      return { ...state, photos: state.photos.filter((_, i) => i !== action.index) };
    case 'SELECT_PALETTE':
      return { ...state, selectedPalette: action.id };
    case 'SELECT_FONT':
      return { ...state, selectedFont: action.id };
    case 'SELECT_LAYOUT':
      return { ...state, selectedLayout: action.id };
    case 'SET_AI_SETTINGS':
      return { ...state, aiSettings: action.settings };
    case 'SET_CARDS_TEXT':
      return { ...state, cardsText: action.cardsText };
    case 'SET_AI_PARAMS':
      return { ...state, aiParams: action.aiParams };
    case 'SET_PHOTO_ANALYSIS':
      return { ...state, photoAnalysis: action.analysis };
    case 'SET_CARDS':
      return { ...state, cards: action.cards };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'OPEN_EDIT':
      return { ...state, editIndex: action.index };
    case 'CLOSE_EDIT':
      return { ...state, editIndex: -1 };
    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.ui } };
    case 'TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    default:
      return state;
  }
}

export { initialState };
```

- [ ] **Step 3: 写 ui/store/AppContext.tsx**

```tsx
import { createContext, useContext, useEffect, useMemo, useReducer, useCallback } from 'react';
import type { ReactNode } from 'react';
import { reducer } from './reducer';
import { initialState, saveAiSettings } from './state';
import type { AppState, ToastItem } from './state';
import type { Action } from './reducer';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // AI 配置持久化（唯一行为改进，spec §4）
  useEffect(() => { saveAiSettings(state.aiSettings); }, [state.aiSettings]);

  const toast = useCallback((msg: string, kind?: 'ok' | 'err') => {
    const item: ToastItem = { id: Date.now() + Math.random(), msg, kind };
    dispatch({ type: 'TOAST', toast: item });
    setTimeout(() => dispatch({ type: 'DISMISS_TOAST', id: item.id }), 2400);
  }, []);

  const value = useMemo(() => ({ state, dispatch, toast }), [state, toast]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
```

- [ ] **Step 4: 类型检查 + Commit**

Run: `npx tsc --noEmit` → 通过。

```bash
git add ui/store/
git commit -m "feat(ui): 全局 Store（useReducer + Context + AI 配置持久化）"
```

---

### Task 9: ui/hooks — usePhotos / useGeneration

**Files:**
- Create: `ui/hooks/usePhotos.ts`、`ui/hooks/useGeneration.ts`

- [ ] **Step 1: 写 ui/hooks/usePhotos.ts**

```ts
import { useCallback } from 'react';
import { config } from '@engine/config';
import { compose } from '@engine';
import { useApp } from '@ui/store/AppContext';
import type { PhotoItem } from '@ui/store/state';

function validateFile(f: File): boolean {
  if (config.input.accept.indexOf(f.type) < 0) return false;
  if (f.size > config.input.maxFileSize) return false;
  return true;
}

function readImage(file: File): Promise<PhotoItem> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const prepared = compose.prepareImage(img);
      // 512px 缩略 dataURL（供 AI 模式）
      const dmax = 512;
      const r = dmax / Math.max(img.naturalWidth, img.naturalHeight);
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(img.naturalWidth * r));
      tmp.height = Math.max(1, Math.round(img.naturalHeight * r));
      tmp.getContext('2d')!.drawImage(img, 0, 0, tmp.width, tmp.height);
      res({ file, url, img: prepared, dataUrl: tmp.toDataURL('image/jpeg', 0.8), raw: img });
    };
    img.onerror = () => rej(new Error('load fail'));
    img.src = url;
  });
}

export function usePhotos() {
  const { state, dispatch, toast } = useApp();

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => {
      const ok = validateFile(f);
      if (!ok) toast(f.size > config.input.maxFileSize ? '文件超过 10MB，已忽略：' + f.name : '已忽略非图片文件：' + f.name, 'err');
      return ok;
    });
    if (!files.length) return;
    const loaded: PhotoItem[] = [];
    for (const f of files) {
      try { loaded.push(await readImage(f)); }
      catch { toast('图片读取失败：' + f.name, 'err'); }
    }
    if (!loaded.length) return;
    if (state.mode === 'default') {
      // 旧照片先 revoke，再由 reducer 替换为第一张
      state.photos.forEach(p => URL.revokeObjectURL(p.url));
    }
    dispatch({ type: 'ADD_PHOTOS', photos: loaded });
  }, [state.mode, state.photos, dispatch, toast]);

  const removePhoto = useCallback((index: number) => {
    const p = state.photos[index];
    if (p) URL.revokeObjectURL(p.url);
    dispatch({ type: 'REMOVE_PHOTO', index });
  }, [state.photos, dispatch]);

  return { photos: state.photos, addFiles, removePhoto };
}
```

- [ ] **Step 2: 写 ui/hooks/useGeneration.ts**

```ts
import { useCallback } from 'react';
import { colorEngine, compose, exporter, splitEngine, analyzeEngine, aiBridge } from '@engine';
import { config } from '@engine/config';
import { useApp } from '@ui/store/AppContext';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

export function useGeneration() {
  const { state, dispatch, toast } = useApp();

  const subjectFor = useCallback((i: number) =>
    state.mode === 'default' ? state.photos[0] : state.photos[i], [state.mode, state.photos]);

  const cardCount = useCallback(() =>
    state.mode === 'default' ? state.n : Math.min(state.n, state.photos.length),
  [state.mode, state.n, state.photos.length]);

  const resolveParams = useCallback(() => {
    const params = colorEngine.resolve({
      paletteId: state.selectedPalette, fontId: state.selectedFont,
      layoutId: state.selectedLayout, text: state.text,
      aiParams: state.aiParams, photo: state.photoAnalysis,
    });
    if (state.aiParams) {
      if (state.aiParams.palette) params.palette = colorEngine.byId(config.palettes, state.aiParams.palette);
      if (state.aiParams.font) params.font = colorEngine.byId(config.fonts, state.aiParams.font);
      if (state.aiParams.layout) params.layout = colorEngine.byId(config.layouts, state.aiParams.layout);
    }
    return params;
  }, [state.selectedPalette, state.selectedFont, state.selectedLayout, state.text, state.aiParams, state.photoAnalysis]);

  const renderOne = useCallback((i: number): HTMLCanvasElement => {
    const params = resolveParams();
    const subject = subjectFor(i);
    return compose.render({
      image: subject.img, palette: params.palette, font: params.font,
      layout: params.layout, tuning: params.tuning,
      text: state.cardsText ? state.cardsText[i] : '',
    });
  }, [resolveParams, subjectFor, state.cardsText]);

  /* 参数切换后即时重渲所有已生成卡片 */
  const rerenderAll = useCallback(() => {
    if (!state.cards) return;
    const next: HTMLCanvasElement[] = [];
    for (let i = 0; i < state.cards.length; i++) next.push(renderOne(i));
    dispatch({ type: 'SET_CARDS', cards: next });
  }, [state.cards, renderOne, dispatch]);

  const generate = useCallback(async () => {
    if (state.loading) return;
    if (state.photos.length === 0) { toast('请先上传至少 1 张照片', 'err'); return; }
    const count = cardCount();
    if (count < 1) { toast('照片数量不足，请上传照片', 'err'); return; }

    const cardsText = splitEngine.split(state.text, count);
    dispatch({ type: 'SET_CARDS_TEXT', cardsText });
    dispatch({ type: 'SET_AI_PARAMS', aiParams: null });
    dispatch({ type: 'SET_PHOTO_ANALYSIS', analysis: null });

    // F3：自动色板时分析首图主色参与选板（仅本地，零出网）
    if (state.selectedPalette === 'auto' && state.photos.length) {
      try {
        const analysis = analyzeEngine.analyze(subjectFor(0).raw);
        dispatch({ type: 'SET_PHOTO_ANALYSIS', analysis });
      } catch { /* 退化为纯文案打分 */ }
    }

    if (state.aiSettings.enabled) {
      dispatch({ type: 'SET_LOADING', loading: true });
      const aiParams = await aiBridge.analyze(state.text, subjectFor(0).dataUrl, state.aiSettings);
      dispatch({ type: 'SET_AI_PARAMS', aiParams });
      dispatch({ type: 'SET_LOADING', loading: false });
      if (!aiParams) toast('AI 调用失败，已回退固定预设', 'err');
    }

    dispatch({ type: 'SET_LOADING', loading: true });
    const cards: HTMLCanvasElement[] = [];
    for (let i = 0; i < count; i++) {
      // 注意：renderOne 依赖的 cardsText/aiParams 刚 dispatch，尚未反映到 state；
      // 用局部变量直接渲染，与旧版行为一致（旧版直接改 state 后渲染）
      const params = resolveParams();
      const subject = subjectFor(i);
      cards.push(compose.render({
        image: subject.img, palette: params.palette, font: params.font,
        layout: params.layout, tuning: params.tuning, text: cardsText[i],
      }));
      await tick();
    }
    dispatch({ type: 'SET_CARDS', cards });
    dispatch({ type: 'SET_LOADING', loading: false });
    toast('生成完成 ✨', 'ok');
  }, [state, cardCount, subjectFor, resolveParams, dispatch, toast]);

  const saveEdit = useCallback((text: string) => {
    if (state.editIndex < 0 || !state.cardsText || !state.cards) return;
    const cardsText = state.cardsText.slice();
    cardsText[state.editIndex] = text;
    dispatch({ type: 'SET_CARDS_TEXT', cardsText });
    const cards = state.cards.slice();
    const params = resolveParams();
    const subject = subjectFor(state.editIndex);
    cards[state.editIndex] = compose.render({
      image: subject.img, palette: params.palette, font: params.font,
      layout: params.layout, tuning: params.tuning, text,
    });
    dispatch({ type: 'SET_CARDS', cards });
    dispatch({ type: 'CLOSE_EDIT' });
    toast('已更新该卡片', 'ok');
  }, [state.editIndex, state.cardsText, state.cards, resolveParams, subjectFor, dispatch, toast]);

  const downloadOne = useCallback((i: number) => {
    if (!state.cards || !state.cards[i]) return;
    const fmt = config.output.format;
    exporter.cardBlob(state.cards[i], fmt, config.output.quality).then(b => {
      if (b) exporter.download(b, `治愈卡片_${exporter.pad(i + 1)}.${fmt === 'image/png' ? 'png' : 'jpg'}`);
    });
  }, [state.cards]);

  const downloadZip = useCallback(async () => {
    if (!state.cards || !state.cards.length) return;
    const fmt = config.output.format;
    await exporter.zip(state.cards, fmt, config.output.quality, '治愈卡片');
    toast('整套 ZIP 已下载 ⬇', 'ok');
  }, [state.cards, toast]);

  return { generate, rerenderAll, saveEdit, downloadOne, downloadZip, resolveParams };
}
```

注意 `useGeneration` 返回 `resolveParams` 供 ControlBar 显示 AI pill 使用（Task 11）。

- [ ] **Step 3: 类型检查 + Commit**

Run: `npx tsc --noEmit` → 通过。

```bash
git add ui/hooks/
git commit -m "feat(ui): 上传与生成编排 hooks（async 编排，reducer 保持纯函数）"
```

---

### Task 10: 样式 + 应用骨架 + Topbar + InputPanel

**Files:**
- Create: `ui/styles/styles.css`、`ui/main.tsx`、`ui/App.tsx`、`ui/components/Topbar.tsx`、`ui/components/InputPanel.tsx`

- [ ] **Step 1: 拷贝设计系统样式**

```bash
mkdir -p ui/styles ui/components
cp legacy/assets/css/styles.css ui/styles/styles.css
```

styles.css 无资源路径引用（已核查），无需改动。

- [ ] **Step 2: 写 ui/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/styles.css';
import { fontEngine } from '@engine';

// 字体就绪后再挂载（对齐旧版 start() 行为；加载失败也只是回退系统字体，不会 reject）
fontEngine.init(import.meta.env.BASE_URL).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
```

- [ ] **Step 3: 写 ui/App.tsx**

```tsx
import { AppProvider } from '@ui/store/AppContext';
import { Topbar } from '@ui/components/Topbar';
import { InputPanel } from '@ui/components/InputPanel';
import { ControlBar } from '@ui/components/ControlBar';
import { PreviewGrid } from '@ui/components/PreviewGrid';
import { ExportBar } from '@ui/components/ExportBar';
import { SettingsDrawer } from '@ui/components/SettingsDrawer';
import { EditModal } from '@ui/components/EditModal';
import { HelpModal } from '@ui/components/HelpModal';
import { LoadingMask } from '@ui/components/LoadingMask';
import { Toast } from '@ui/components/Toast';

export default function App() {
  return (
    <AppProvider>
      <Topbar />
      <main className="layout">
        <InputPanel />
        <section className="work">
          <ControlBar />
          <PreviewGrid />
          <ExportBar />
        </section>
      </main>
      <SettingsDrawer />
      <EditModal />
      <HelpModal />
      <LoadingMask />
      <Toast />
    </AppProvider>
  );
}
```

- [ ] **Step 4: 写 ui/components/Topbar.tsx**

```tsx
import { useApp } from '@ui/store/AppContext';
import type { Mode } from '@ui/store/state';

const MODE_TIP: Record<Mode, string> = {
  default: '默认模式：1 张照片复用于所有卡片，文案按张数自动切分，可逐卡改字。',
  multi: '逐图主体：每张照片成为一张卡片的主体，风格仍统一；文案按张数自动切分。',
};

export function Topbar() {
  const { state, dispatch } = useApp();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true">☀</span>
        <span className="brand-name">治愈系图片生成器</span>
      </div>
      <div className="topbar-right">
        <div className="seg" role="tablist" aria-label="模式切换">
          {(['default', 'multi'] as Mode[]).map(m => (
            <button
              key={m}
              className={'seg-btn' + (state.mode === m ? ' is-active' : '')}
              role="tab"
              onClick={() => dispatch({ type: 'SET_MODE', mode: m })}
            >
              {m === 'default' ? '默认模式' : '逐图主体'}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="设置（AI 模式）" onClick={() => dispatch({ type: 'SET_UI', ui: { settingsOpen: true } })}>
          ⚙<span className="icon-btn-label">设置</span>
        </button>
        <button className="icon-btn" title="帮助" onClick={() => dispatch({ type: 'SET_UI', ui: { helpOpen: true } })}>
          ?<span className="icon-btn-label">帮助</span>
        </button>
      </div>
    </header>
  );
}

export { MODE_TIP };
```

- [ ] **Step 5: 写 ui/components/InputPanel.tsx**

```tsx
import { useRef, useState } from 'react';
import { config } from '@engine/config';
import { useApp } from '@ui/store/AppContext';
import { usePhotos } from '@ui/hooks/usePhotos';
import { useGeneration } from '@ui/hooks/useGeneration';
import { MODE_TIP } from './Topbar';

export function InputPanel() {
  const { state, dispatch } = useApp();
  const { photos, addFiles, removePhoto } = usePhotos();
  const { generate } = useGeneration();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const max = config.input.maxCards;
  const textNote = state.mode === 'default'
    ? `将自动切分为 ${state.n} 段，每张卡片一段`
    : `每张卡片对应一张照片（已上传 ${photos.length} 张）`;

  return (
    <aside className="panel">
      <section className="panel-block">
        <h2 className="panel-title"><span className="step">①</span> 上传照片</h2>
        <div
          className={'dropzone' + (dragging ? ' is-drag' : '')}
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileRef} type="file" multiple hidden
            accept={config.input.accept.join(',')}
            onChange={e => { addFiles(e.target.files!); e.target.value = ''; }}
          />
          <div className="dz-inner">
            <span className="dz-icon" aria-hidden="true">＋</span>
            <p className="dz-text">拖拽照片到此处 / 点击选择</p>
            <p className="dz-hint">支持 JPG / PNG / WEBP · 单张 ≤ 10MB</p>
          </div>
        </div>
        <ul className="thumb-list">
          {photos.map((p, i) => (
            <li key={p.url} className={'thumb-item' + (i === 0 ? ' is-active' : '')}>
              <img src={p.url} alt="" />
              <button className="thumb-remove" title="移除" onClick={() => removePhoto(i)}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-block">
        <h2 className="panel-title"><span className="step">②</span> 卡片数量 N</h2>
        <div className="stepper">
          <button className="step-btn" aria-label="减少" disabled={state.n <= 1} onClick={() => dispatch({ type: 'SET_N', n: state.n - 1 })}>−</button>
          <span className="step-val">{state.n}</span>
          <button className="step-btn" aria-label="增加" disabled={state.n >= max} onClick={() => dispatch({ type: 'SET_N', n: state.n + 1 })}>＋</button>
          <span className="step-caption">张</span>
        </div>
      </section>

      <section className="panel-block">
        <h2 className="panel-title"><span className="step">③</span> 写文案</h2>
        <textarea
          className="text-input" rows={5} value={state.text}
          placeholder="写一段想对这个世界说的话……"
          onChange={e => dispatch({ type: 'SET_TEXT', text: e.target.value })}
        />
        <p className="panel-note">{textNote}</p>
      </section>

      <p className="mode-tip">{MODE_TIP[state.mode]}</p>

      <button className="btn-primary btn-generate" onClick={generate}>生成治愈卡片 ✨</button>
    </aside>
  );
}
```

- [ ] **Step 6: 冒烟验证**

临时在 `main.tsx` 挂载后用浏览器打开 `http://localhost:5173/`：顶栏与左侧输入面板渲染正常、上传/张数/文案交互有响应（右侧组件 Task 11/12 才有，暂时空白属预期）。

- [ ] **Step 7: Commit**

```bash
git add ui/styles/ ui/main.tsx ui/App.tsx ui/components/Topbar.tsx ui/components/InputPanel.tsx
git commit -m "feat(ui): 应用骨架 + 顶栏 + 输入面板（沿用旧设计系统）"
```

---

### Task 11: ControlBar + PreviewGrid + ExportBar

**Files:**
- Create: `ui/components/ControlBar.tsx`、`ui/components/PreviewGrid.tsx`、`ui/components/ExportBar.tsx`

- [ ] **Step 1: 写 ui/components/ControlBar.tsx**

```tsx
import { config } from '@engine/config';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

const AUTO_GRADIENT = 'linear-gradient(135deg,#FBF3E4 0%,#F2C6D0 50%,#A9C7D9 100%)';

export function ControlBar() {
  const { state, dispatch } = useApp();
  const { rerenderAll, resolveParams } = useGeneration();

  const pick = (patch: { type: 'SELECT_PALETTE' | 'SELECT_FONT' | 'SELECT_LAYOUT'; id: string }) => {
    dispatch(patch);
    // dispatch 后 state 未即时更新，用 setTimeout 让重渲发生在新状态渲染后
    setTimeout(rerenderAll, 0);
  };

  const isAi = state.aiSettings.enabled && !!state.aiParams;
  const swatchItems = [{ id: 'auto', name: '自动', isAuto: true }, ...config.palettes];
  const activePalette = resolveParams().palette;

  return (
    <div className="controlbar">
      <div className="ctrl-group">
        <span className="ctrl-label">色板</span>
        <div className="swatch-row">
          {swatchItems.map(p => {
            const active = p.id === state.selectedPalette;
            return (
              <button
                key={p.id}
                className={'swatch' + (active ? ' is-active' : '') + (p.isAuto ? ' swatch-auto' : '')}
                title={p.name}
                style={p.isAuto
                  ? { background: AUTO_GRADIENT, borderColor: active ? 'var(--ink)' : 'rgba(0,0,0,.15)' }
                  : { background: (p as (typeof config.palettes)[number]).base, borderColor: active ? 'var(--ink)' : (p as (typeof config.palettes)[number]).accent }}
                onClick={() => pick({ type: 'SELECT_PALETTE', id: p.id })}
              />
            );
          })}
        </div>
      </div>
      <div className="ctrl-group">
        <span className="ctrl-label">字体</span>
        <div className="chip-row">
          {config.fonts.map(f => (
            <button
              key={f.id}
              className={'chip' + (f.id === state.selectedFont ? ' is-active' : '')}
              onClick={() => pick({ type: 'SELECT_FONT', id: f.id })}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div className="ctrl-group">
        <span className="ctrl-label">版式</span>
        <div className="chip-row">
          {config.layouts.map(l => (
            <button
              key={l.id}
              className={'chip' + (l.id === state.selectedLayout ? ' is-active' : '')}
              onClick={() => pick({ type: 'SELECT_LAYOUT', id: l.id })}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <span className={'mode-pill' + (isAi ? ' is-ai' : '')}>
        {isAi ? `AI · 智能调参（${activePalette?.name ?? ''}）` : '非AI · 固定预设'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: 写 ui/components/PreviewGrid.tsx**

Canvas 经 ref 直挂、不进 React 渲染树（spec §4 关键决策 1）：

```tsx
import { useEffect, useRef } from 'react';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

function CardCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(canvas);
  }, [canvas]);
  return <div className="card-canvas" ref={ref} />;
}

export function PreviewGrid() {
  const { state, dispatch } = useApp();
  const { downloadOne } = useGeneration();
  const cards = state.cards;
  const hasCards = !!cards && cards.length > 0;

  const openEdit = (i: number) => {
    if (!state.cardsText) return;
    dispatch({ type: 'OPEN_EDIT', index: i });
  };

  return (
    <>
      <div className="preview-head">
        <span>{hasCards ? `预览（${cards!.length} / ${cards!.length}）` : '预览（0 / 0）'}</span>
        <span className="preview-sub">点击卡片可编辑文字 · 切换上方参数即重渲</span>
      </div>
      <div className="preview-area">
        {!hasCards && (
          <div className="empty-state is-show">
            <span className="empty-icon" aria-hidden="true">🌿</span>
            <p className="empty-title">还没有卡片</p>
            <p className="empty-desc">上传照片、写下文案，点「生成治愈卡片」开始。</p>
          </div>
        )}
        <div className="preview-grid">
          {hasCards && cards!.map((cv, i) => (
            <div key={i} className="card" onClick={() => openEdit(i)}>
              <CardCanvas canvas={cv} />
              <div className="card-badge">{i + 1}</div>
              <div className="card-actions">
                <button className="card-act" onClick={e => { e.stopPropagation(); openEdit(i); }}>编辑 ✎</button>
                <button className="card-act" onClick={e => { e.stopPropagation(); downloadOne(i); }}>下载 ⬇</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: 写 ui/components/ExportBar.tsx**

```tsx
import { useState } from 'react';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

const FMT_LABEL: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG' };

export function ExportBar() {
  const { state } = useApp();
  const { downloadZip } = useGeneration();
  const [fmt, setFmt] = useState('image/jpeg');

  return (
    <div className="export-bar">
      <div className="export-info">
        <span className="export-title">导出</span>
        <span className="export-note">默认 JPG 0.92 · 可选 PNG · 照片仅在本地处理，不上传</span>
      </div>
      <div className="export-actions">
        <label className="fmt-toggle">
          <span>格式</span>
          <select value={fmt} onChange={e => setFmt(e.target.value)}>
            <option value="image/jpeg">JPG</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
        <button className="btn-ghost" disabled={!state.cards?.length} onClick={downloadZip}>
          整套打包 ZIP ⬇
        </button>
      </div>
    </div>
  );
}
```

注意：旧版 `fmtSelect` 决定导出格式，但新版中 `useGeneration.downloadOne/downloadZip` 读 `config.output.format`（固定 JPG）。为保持「可选 PNG」行为，将 fmt 提升到 state：在 `ui/store/state.ts` 的 `AppState` 增加 `exportFmt: string`（初始 `'image/jpeg'`），`reducer.ts` 增加 `| { type: 'SET_EXPORT_FMT'; fmt: string }` 分支（返回 `{ ...state, exportFmt: action.fmt }`），`useGeneration` 中 `downloadOne/downloadZip` 改用 `state.exportFmt`。本任务 Step 3 的代码相应改为：

```tsx
// ExportBar.tsx 中：
const { state, dispatch } = useApp();
// select onChange：
onChange={e => dispatch({ type: 'SET_EXPORT_FMT', fmt: e.target.value })}
```

```ts
// useGeneration.ts 中 downloadOne/downloadZip：
const fmt = state.exportFmt;   // 替换 const fmt = config.output.format;
```

- [ ] **Step 4: 冒烟验证**

`npm run dev` → 上传照片、写文案、生成；切换色板/字体/版式即时重渲；单张下载、ZIP 下载可用。

- [ ] **Step 5: Commit**

```bash
git add ui/components/ControlBar.tsx ui/components/PreviewGrid.tsx ui/components/ExportBar.tsx ui/store/ ui/hooks/
git commit -m "feat(ui): 控制条/预览网格/导出条（canvas 直挂 + 导出格式入状态）"
```

---

### Task 12: 弹层组件 — SettingsDrawer / EditModal / HelpModal / LoadingMask / Toast

**Files:**
- Create: `ui/components/SettingsDrawer.tsx`、`ui/components/EditModal.tsx`、`ui/components/HelpModal.tsx`、`ui/components/LoadingMask.tsx`、`ui/components/Toast.tsx`

- [ ] **Step 1: 写 ui/components/SettingsDrawer.tsx**

```tsx
import { useApp } from '@ui/store/AppContext';
import type { AiSettings } from '@engine/config';

export function SettingsDrawer() {
  const { state, dispatch } = useApp();
  const { ui, aiSettings } = state;
  const close = () => dispatch({ type: 'SET_UI', ui: { settingsOpen: false } });
  const patch = (p: Partial<AiSettings>) => dispatch({ type: 'SET_AI_SETTINGS', settings: { ...aiSettings, ...p } });

  return (
    <>
      <div className="drawer-mask" hidden={!ui.settingsOpen} onClick={close} />
      <aside className="drawer" hidden={!ui.settingsOpen} aria-label="设置">
        <div className="drawer-head">
          <h3>设置</h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="setting-row">
            <div>
              <p className="setting-name">AI 智能调参</p>
              <p className="setting-desc">开启后用你自己的大模型分析图片+文案，返回更优色板/字体/版式。</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={aiSettings.enabled} onChange={e => patch({ enabled: e.target.checked })} />
              <span className="switch-slider" />
            </label>
          </div>
          <div className={'setting-fields' + (aiSettings.enabled ? ' is-on' : '')}>
            <label className="field">
              <span>API Endpoint</span>
              <input type="text" value={aiSettings.endpoint} placeholder="https://your-llm/v1/chat/completions" onChange={e => patch({ endpoint: e.target.value })} />
            </label>
            <label className="field">
              <span>API Key</span>
              <input type="password" value={aiSettings.apiKey} placeholder="sk-..." autoComplete="off" onChange={e => patch({ apiKey: e.target.value })} />
            </label>
            <label className="field">
              <span>Model</span>
              <input type="text" value={aiSettings.model} placeholder="gpt-4o / claude-3-5 ... / 自建视觉模型" onChange={e => patch({ model: e.target.value })} />
            </label>
          </div>
          <p className="privacy-note">
            🔒 隐私说明：照片默认只在你浏览器本地处理，<b>不上传</b>任何服务器。仅当你开启 AI 模式并填入自己的
            凭据后，才会把「图片+文案」发往<b>你配置的</b> endpoint。关闭 AI 则为纯离线。
          </p>
          <p className="privacy-note sub">AI 调用失败或超时将自动回退到固定预设，不会中断出图。</p>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: 写 ui/components/EditModal.tsx**

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

export function EditModal() {
  const { state, dispatch } = useApp();
  const { saveEdit } = useGeneration();
  const open = state.editIndex >= 0 && !!state.cardsText;
  const [draft, setDraft] = useState('');

  // 打开时用当前卡文案初始化草稿
  useEffect(() => {
    if (state.editIndex >= 0 && state.cardsText) setDraft(state.cardsText[state.editIndex] || '');
  }, [state.editIndex, state.cardsText]);

  const close = () => dispatch({ type: 'CLOSE_EDIT' });

  return (
    <>
      <div className="modal-mask" hidden={!open} onClick={close} />
      <div className="modal" hidden={!open}>
        <div className="modal-head">
          <h3>编辑第 {state.editIndex + 1} 张</h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <textarea className="text-input" rows={4} value={draft} onChange={e => setDraft(e.target.value)} />
        <div className="modal-foot">
          <button className="btn-ghost" onClick={close}>取消</button>
          <button className="btn-primary" onClick={() => saveEdit(draft)}>保存并重渲</button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: 写 ui/components/HelpModal.tsx**

```tsx
import { useApp } from '@ui/store/AppContext';

export function HelpModal() {
  const { state, dispatch } = useApp();
  const close = () => dispatch({ type: 'SET_UI', ui: { helpOpen: false } });
  return (
    <>
      <div className="modal-mask" hidden={!state.ui.helpOpen} onClick={close} />
      <div className="modal modal-help" hidden={!state.ui.helpOpen}>
        <div className="modal-head">
          <h3>怎么用</h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <div className="help-body">
          <p><b>默认模式</b>：上传 1 张照片，选张数 N，写一段文案 → 自动切成 N 段，每张卡片一段，可逐卡改字。</p>
          <p><b>逐图主体</b>：上传 N 张照片，每张成为一张卡片的主体，风格仍统一。</p>
          <p>选好色板 / 字体 / 版式后点「生成治愈卡片」。随时切换参数会即时重渲。</p>
          <p>导出：每张卡片可单独下载，或点「整套打包 ZIP」一次下载。</p>
          <p className="help-priv">🔒 照片只在本地浏览器处理，不会上传。</p>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: 写 ui/components/LoadingMask.tsx 与 ui/components/Toast.tsx**

```tsx
// LoadingMask.tsx
import { useApp } from '@ui/store/AppContext';

export function LoadingMask() {
  const { state } = useApp();
  return (
    <div className="loading-mask" hidden={!state.loading}>
      <div className="loading-card">
        <span className="spinner" aria-hidden="true" />
        <p>{state.aiSettings.enabled && !state.cards ? 'AI 正在理解你的图片…' : '正在生成治愈卡片…'}</p>
      </div>
    </div>
  );
}
```

```tsx
// Toast.tsx
import { useApp } from '@ui/store/AppContext';

export function Toast() {
  const { state } = useApp();
  return (
    <div className="toast-wrap">
      {state.toasts.map(t => (
        <div key={t.id} className={'toast' + (t.kind ? ' ' + t.kind : '')}>{t.msg}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 类型检查 + Commit**

Run: `npx tsc --noEmit` → 通过。

```bash
git add ui/components/
git commit -m "feat(ui): 设置抽屉/逐卡编辑/帮助/Loading/Toast 弹层组件"
```

---

### Task 13: 构建验证 + 手动走查

**Files:** 无新建，全量验证。

- [ ] **Step 1: 全量类型检查 + 单测 + 构建**

Run: `npm run build`
Expected: `tsc --noEmit` 0 错误；vitest 21 passed；`vite build` 输出 `dist/`。

- [ ] **Step 2: 手动走查清单（npm run dev，逐项验证）**

1. 默认模式：1 图 + 文案 → N 张卡片，文案自动切分，每张可编辑
2. 逐图主体模式：上传 3 图 → 3 卡片，每张主体不同
3. 色板（含「自动」）× 字体 × 4 版式切换 → 即时重渲
4. 逐卡编辑 → 保存后该卡重渲
5. 单张下载 JPG；切换 PNG 后下载 .png
6. 整套 ZIP：解压验证中文文件名 `治愈卡片_01.jpg` 不乱码
7. AI 关闭：pill 显示「非AI · 固定预设」
8. AI 开启 + 填假 endpoint：生成时回退 toast「AI 调用失败，已回退固定预设」，出图不中断
9. AI endpoint/key/model 填写后刷新页面 → 设置抽屉中仍在（localStorage）
10. 9 张上限、10MB 拒收 toast、非图片拒收 toast

- [ ] **Step 3: 生产产物冒烟**

Run: `npm run preview` → 打开输出地址，重复走查 1–6 中任意 3 项。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: React+Vite 重构完成，构建与走查通过"
```

---

## 自审记录

- **Spec 覆盖**：spec §3 目录（Task 0–12 一一对应）、§4 状态（Task 8/9，含 localStorage 持久化）、§5 迁移映射（Task 2–7）、§6 错误处理（散布于 usePhotos/useGeneration/aiBridge，行为与旧版一致）、§7 验证（Task 13）→ 无缺口。
- **占位符扫描**：compose.ts 五个内部函数体标注了 legacy 精确行区间照抄（源文件在仓库内，非外部依赖），其余步骤均含完整代码。
- **类型一致性**：`ZipEntry`（Task 5 定义，Task 7 引用）、`PhotoItem`（Task 8 定义，Task 9 引用）、`resolveParams`（Task 9 返回，Task 11 引用）、`exportFmt`（Task 11 内补充定义并同步修改 state/reducer/useGeneration）均已对齐。
