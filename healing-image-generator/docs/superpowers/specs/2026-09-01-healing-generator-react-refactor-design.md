# 治愈系图片生成器 · React + Vite 工程化重构设计

- 日期：2026-09-01
- 状态：已确认（用户批准方案 A + 双目录分离结构）
- 前置文档：`治愈系图片生成器_技术文档.md`（设计规格 v0.2）、`README.md`

## 1. 背景与目标

现有版本为「零构建、免依赖」纯静态站点：经典脚本按依赖顺序加载，共享 `window.Heal` / `window.HealConfig` 命名空间，双击 `index.html` 即可运行。

本次重构目标：迁移到 **Vite + React 18 + TypeScript**，UI 层组件化，引擎层类型化并保持与框架无关；功能与视觉与旧版**完全一致**，不增删任何用户可见功能。

非目标：
- 不迁移到 npm workspaces / 不发布 npm 包（结构上为将来留余地即可）
- 不重写样式为 Tailwind，沿用现有浅色治愈设计系统
- 不改引擎算法逻辑（色板打分、切分、合成、ZIP 编码均原样迁移）

## 2. 总体架构

三层分离，单向数据流：

```
UI 层 (ui/components, React)  →  dispatch action  →  Store (useReducer + Context)
                                                        ↓ state
引擎层 (engine/, 纯 TS, 零 React 依赖)
                                                        ↓ canvas
合成/导出 (compose → HTMLCanvasElement → export 下载)
```

分层纪律：
- `engine/` 只被 `ui/` 引用，**绝不反向引用**
- engine 内部禁止 `import React`、禁止查询 DOM；Canvas/Image API 只通过函数参数传入
- 领域类型（Palette / Font / Layout / Tuning / MoodRule / AiParams 等）全部定义在 `engine/config.ts`，UI 层只 import 类型

## 3. 目录结构

```
.
├── legacy/                      # 旧版整体移入（index.html、assets/、diagram/、技术文档）
├── index.html                   # Vite 入口（<div id="root"> + module script）
├── package.json / vite.config.ts / tsconfig.json / .gitignore
├── public/fonts/                # Vite 静态资源（NotoSansSC.woff2、ZCOOLKuaiLe.woff2）
├── engine/                      # ══ 引擎层：纯 TS ══
│   ├── index.ts                 # 统一出口
│   ├── config.ts                # 全配置 + 领域类型
│   ├── colorEngine.ts           # resolve() 情绪匹配 + byId()
│   ├── analyze.ts               # 图像主色/亮度分析
│   ├── fontEngine.ts            # FontFace 预载
│   ├── splitEngine.ts           # 文案切分 N 段
│   ├── compose.ts               # Canvas 合成（4 种版式 geometry + prepareImage）
│   ├── export.ts                # blob 下载 / zip
│   ├── zip.ts                   # 零依赖 ZIP（CRC32 + store + UTF-8）
│   └── aiBridge.ts              # 可选 AI 参数桥
├── ui/                          # ══ UI 层：React 应用 ══
│   ├── main.tsx                 # 挂载 + fontEngine.init()
│   ├── App.tsx                  # 布局骨架 + AppProvider
│   ├── styles/styles.css        # 原 348 行设计系统全局样式（按新路径微调字体引用）
│   ├── store/
│   │   ├── state.ts             # AppState 类型 + 初始值
│   │   ├── reducer.ts           # 纯 reducer
│   │   └── AppContext.tsx       # Context + useApp() hook
│   ├── hooks/
│   │   ├── usePhotos.ts         # 上传/校验/readImage/撤销 ObjectURL
│   │   └── useGeneration.ts     # generate / rerenderAll / 编辑保存（async 编排）
│   └── components/
│       ├── Topbar.tsx           # 品牌 + 模式切换 + 设置/帮助按钮
│       ├── InputPanel.tsx       # Dropzone + ThumbList + N stepper + 文案框 + 生成按钮
│       ├── ControlBar.tsx       # 色板 swatches / 字体 chips / 版式 chips / mode-pill
│       ├── PreviewGrid.tsx      # 卡片网格（canvas 经 ref 直挂，不走 React diff）
│       ├── ExportBar.tsx        # 格式选择 + ZIP 按钮
│       ├── SettingsDrawer.tsx   # AI 设置抽屉
│       ├── EditModal.tsx        # 逐卡编辑弹层
│       ├── HelpModal.tsx
│       ├── LoadingMask.tsx
│       └── Toast.tsx            # useToasts() + 容器
└── tests/                       # 引擎层单测（splitEngine / colorEngine / zip）
```

路径别名（vite.config.ts + tsconfig paths 同步配置）：
- `@engine/*` → `engine/*`
- `@ui/*` → `ui/*`

## 4. 状态设计

```ts
interface AppState {
  mode: 'default' | 'multi';
  n: number;
  photos: PhotoItem[];            // { file, url, img, dataUrl, raw }
  text: string;
  selectedPalette: string;        // 'auto' | paletteId
  selectedFont: string;           // 'auto' | fontId
  selectedLayout: string;
  aiSettings: { enabled: boolean; endpoint: string; apiKey: string; model: string };
  cardsText: string[] | null;
  aiParams: AiParams | null;
  photoAnalysis: Analysis | null;
  cards: HTMLCanvasElement[] | null;
  loading: boolean;
  editIndex: number;
  ui: { settingsOpen: boolean; helpOpen: boolean };
  toasts: ToastItem[];
}
```

Actions：`SET_MODE / SET_N / SET_TEXT / ADD_PHOTOS / REMOVE_PHOTO / SELECT_PALETTE / SELECT_FONT / SELECT_LAYOUT / SET_AI_SETTINGS / SET_CARDS / SET_CARDS_TEXT / SET_LOADING / OPEN_EDIT / CLOSE_EDIT / TOAST / DISMISS_TOAST / TOGGLE_DRAWER`。

关键决策：
1. **Canvas 不进 React 渲染树**：`PreviewGrid` 用 ref 容器直挂 canvas，React 只负责卡片外壳（badge、编辑/下载按钮）。避免 reconcile 大量 canvas 节点。
2. **async 编排放 hooks，不放 reducer**：`useGeneration.generate()` 承接旧 `generate()` 的时序（split → analyze → AI → 逐卡渲染 + `await tick()` 让出主线程）；reducer 保持纯函数、可单测。
3. **AI 配置持久化**：endpoint / apiKey / model 存 `localStorage`（key: `heal.aiSettings`），初始化时读回。这是对旧版的唯一行为改进。

## 5. 引擎迁移映射

| 旧文件（assets/js/） | 新文件（engine/） | 改动 |
|---|---|---|
| config.js | config.ts | 加 interface；`window.HealConfig` → 命名导出 |
| colorEngine.js | colorEngine.ts | 签名加类型，逻辑不动 |
| analyze.js | analyze.ts | 加类型 |
| fontEngine.js | fontEngine.ts | 字体路径由 UI 层初始化时传入（`BASE_URL + 'fonts/…'`），engine 不读 `import.meta.env` |
| splitEngine.js | splitEngine.ts | 加类型 |
| compose.js | compose.ts | 4 种 geometry 原样保留；`prepareImage` 保留在 compose 供 usePhotos 调用 |
| export.js | export.ts | 加类型 |
| zip.js | zip.ts | 加类型，CRC32/store/UTF-8 编码逻辑不动 |
| aiBridge.js | aiBridge.ts | fetch 逻辑不变，返回类型化 AiParams |
| app.js | store/* + hooks/* + components/* | **唯一被拆散重写的文件**，无原样保留 |

## 6. 错误处理与边界（继承旧版行为）

- 文件校验（MIME 类型 / ≤10MB / ≤9 张）→ toast 提示，不合规文件跳过
- 图片读取失败 → toast 提示，跳过该张
- AI 调用失败或超时 → 回退固定预设 + toast，不中断出图
- 自动色板下 analyze 异常 → `photoAnalysis = null`，退化为纯文案情绪打分
- 无卡片时 ZIP 按钮保持禁用
- 照片仅本地处理；只有用户显式开启 AI 并填入自己的 endpoint 才出网

## 7. 验证方式

- `npx tsc --noEmit` 通过
- `npm run dev` 手动走查清单：
  1. 默认模式：1 图 + 文案 → N 张卡片，文案自动切分
  2. 逐图主体模式：N 图 → N 卡片
  3. 4 版式 × 3 色板 + 自动色板切换即时重渲
  4. 逐卡编辑 → 保存重渲
  5. 单张下载 JPG / PNG
  6. 整套 ZIP 打包，中文文件名不乱码
  7. AI 关闭 / 开启（含失败回退 toast）
  8. AI 配置刷新后仍在（localStorage）
- `npm run build` 产物可静态部署（Vercel/Netlify/GitHub Pages）
- 引擎单测（tests/，用 vitest，`npm run test`）：splitEngine 切分边界（空文案/标点/长句）、colorEngine 打分（rosy 权重优先于 warm+bright）、zip 结构（CRC32 与 UTF-8 文件名标志位）

## 8. 部署

纯静态 SPA（无路由），`vite build` 输出 `dist/`；Vercel / Netlify / GitHub Pages 默认配置即可。
