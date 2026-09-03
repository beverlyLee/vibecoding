# 治愈系图片生成器

上传一张照片、写一段文案，一键生成整套风格统一的治愈系卡片：自动配色、多种版式、可拖动文字排版，支持 AI 代写文案与 AI 生成相似图。所有处理均在浏览器本地完成，照片不会上传。

## 访问方法

**在线访问（推荐）**：项目已配置 Vercel 部署文件（`vercel.json`），将 `healing-image-generator/` 目录导入 Vercel（或 Netlify，配合 `public/_redirects`）即可获得在线地址，无需服务器。

**本地运行**：

```bash
# 1. 克隆仓库（项目在 healing-image-generator/ 子目录）
git clone https://github.com/beverlyLee/vibecoding
cd vibecoding/healing-image-generator

# 2. 安装依赖并启动（要求 Node 18+）
npm install
npm run dev        # 打开 http://localhost:5173
```

**本地服务器部署**：`npm run build && node server.js`，同端口提供静态页面 + 火山方舟 API 反向代理，适合 VPS / Render / Railway 等 Node 环境。

> AI 代写 / AI 生图需要自行配置供应商 API Key：打开页面右上角 ⚙ 设置，选择供应商并填入 Key（详见下文「AI 配置」）。不配置也能使用配色、版式、文字排版等全部本地功能。

## 功能特性

- **两种模式**：默认模式（1 张照片复用 + 文案自动切成 N 段）／ 逐图主体（N 张照片各成一卡）
- **版式与比例**：居中留白、左文右图、上下分栏、圆形裁切、图文叠加 5 种版式；2:3 / 3:4 / 4:5 / 1:1 / 9:16 常用比例，切换即时重渲
- **自动配色**：分析照片主色与明度，自动匹配奶油暖阳／晚樱粉／雾霭蓝等色板，也可手动固定
- **文字系统**：
  - 每张卡片支持多个文本框，可在预览图上直接拖动定位
  - 字体 10 种、字重、字号、对齐、行距、字间距
  - 颜色：预设色 + 页内 HSV 色轮（自定义颜色、明度、透明度）+ Hex 输入
  - 描边（颜色 + 宽度）、文字背景色（含透明度，可一键清除）
  - 「应用到全部」一键把当前样式同步到所有卡片
- **AI 能力（可选）**：接入自配的 OpenAI 兼容供应商，支持 AI 代写文案、单卡 AI 生图 / 上传替换图后生成同款主角相似图；模型测试按钮一键验证连通性
- **草稿箱**：文案、设置、文本框、替换图自动保存（IndexedDB，含原图），随时恢复继续编辑
- **导出**：单卡下载（JPG/PNG）或整套打包 ZIP；导出时文字真正合并进图片

## 快速开始

```bash
npm install
npm run dev       # 开发：http://localhost:5173
npm run build     # 类型检查 + 生产构建（产物在 dist/）
npm run preview   # 本地预览构建产物
npm run test      # Vitest 单元测试
```

要求 Node 18+。

## 发布与部署

`npm run build` 后 `dist/` 即为纯静态发布包（或直接使用 `healing-image-generator-dist.zip`）。

- **纯静态托管**（Nginx / Vercel / 静态托管平台）：直接部署 `dist/` 即可；仓库已含 `vercel.json` 与 `public/_redirects` 配置方舟 CORS 代理规则
- **自带服务器**：`PORT=3000 node server.js` —— 零依赖 Node 服务器，同一端口提供静态托管 + 方舟反向代理（`/proxy-ark/* → ark.cn-beijing.volces.com/*`），适用于 VPS / Render / Railway / Fly.io 等任何能跑 Node 的环境

> 说明：直连无 CORS 问题的供应商（DeepSeek、混元等）无需代理；火山方舟必须经代理转发，纯静态托管需配置对应转发规则。

## AI 配置

右上角 ⚙ 打开设置，选择供应商档案（内置火山方舟 / 腾讯混元 / DeepSeek，可自定义 OpenAI 兼容服务），填入 API Key 与模型：

- 文案模型：任意 chat 模型（如 doubao-seed-2-0-lite-260428）
- 图像模型：需供应商支持生图（方舟用 Seedream 系列，如 doubao-seedream-4-0-250828）
- 用「测试」按钮验证模型可用性；失败时会显示真实原因（HTTP 状态 / CORS / 超时）
- 方舟浏览器直连有 CORS 限制时，dev 环境已内置 `/ark-proxy` 代理转发

## 调试

每次 AI 调用的完整提示词会以可展开分组打印到浏览器控制台（`[AI]` 前缀）。日志按天分片存储（保留 7 天），控制台可用调试入口：

```js
window.healLogger.days()              // 列出有日志的日期
window.healLogger.entries('2026-09-03') // 读某天日志
window.healLogger.download()          // 导出为 JSON
```

## 目录结构

```
engine/          # 与 UI 无关的核心引擎（纯 TS，可独立测试）
  config.ts      #   色板 / 字体 / 版式 / 比例 / AI 提示词配置
  providers.ts   #   AI 供应商档案表（baseUrl / 模型 / 生图协议）
  aiBridge.ts    #   AI 调用（chat / images，含测试与日志）
  colorEngine.ts #   照片主色分析 → 色板匹配
  compose.ts     #   卡片渲染 + 文本框画布合并
  splitEngine.ts #   文案切 N 段
  fontEngine.ts  #   字体加载
  export.ts/zip.ts # 单卡导出 / ZIP 打包
  logger.ts      #   按天滚动日志
ui/              # React 界面（components / hooks / store）
tests/           # Vitest 单元测试
docs/            # 设计文档
```

## 隐私

照片只在本地浏览器处理，不会上传；AI 功能仅在用户主动配置并调用时，把文案（及所选图片）发往自己配置的供应商。
