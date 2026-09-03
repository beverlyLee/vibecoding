# AI 供应商统一接入（供应商档案表）设计

日期：2026-09-02
状态：待评审
前置：治愈系图片生成器 React 重构已完成；方舟临时适配（`9042e4e`）将被本方案收敛为档案表。

## 1. 目标与范围

- 目标：新增供应商（腾讯混元、OpenAI 官方、未来的 DeepSeek/智谱等）时，只需在档案表中加一个声明式对象（约 15 行），无需改引擎逻辑。
- 决策约束（用户已确认）：
  - **纯预设供应商**：不暴露协议字段，选供应商后只填 Key 与模型；
  - **同时只用一家**：文案/调参/生图同源，换供应商各字段独立保存；
  - **仅本地 dev 运行**：CORS 代理由 vite dev server 提供，不设计生产反代方案。

## 2. 档案结构（`engine/providers.ts`）

```ts
export interface ImageProfile {
  protocol: 'openai-multipart' | 'ark-json';
  size: string;                            // '1024x1536' | '2K'
  supportsReference: boolean;              // 能否携带参考图
  extra?: Record<string, unknown>;         // 追加字段，如 { watermark: false, response_format: 'b64_json' }
}

export interface ProviderProfile {
  id: string;                              // 'ark' | 'hunyuan' | 'openai' | 'custom'
  name: string;
  baseUrl: string;                         // chat 与 images 请求的拼接基址
  chatModels: string[];                    // 预设模型（UI datalist，可自由输入）
  imageModels: string[];                   // 空数组 = 该供应商无生图能力
  image?: ImageProfile;                    // 无生图能力时省略
  needsProxy: boolean;                     // 浏览器直连是否被 CORS 拦截
  note?: string;                           // 抽屉内展示的接入提示
}
```

### 首版档案

| id | baseUrl | chat | 生图 | needsProxy | note 要点 |
|---|---|---|---|---|---|
| `ark` | `https://ark.cn-beijing.volces.com/api/v3` | OpenAI 兼容 | `ark-json`，size `2K`，支持参考图，extra `{ response_format:'b64_json', watermark:false }` | true | 生图需开通 Seedream 系列；doubao-seed 文本模型不能生图 |
| `hunyuan` | `https://api.hunyuan.cloud.tencent.com/v1` | OpenAI 兼容 | 无（官方生图走腾讯云专用签名 API，浏览器端不可行） | false | Key 格式 `{secret_id}:{secret_key}`；baseUrl 勿带尾部斜杠 |
| `openai` | `https://api.openai.com/v1` | OpenAI 兼容 | `openai-multipart`，size `1024x1536`，支持参考图（404/405 自动降级 generations 纯文生图） | false | 需网络可达；地区限制时可用 custom 指向中转网关 |
| `custom` | 用户填写 | OpenAI 兼容 | `openai-multipart` + 降级 | false | 兜底档案：暴露 baseUrl 输入框，适配任意 OpenAI 兼容网关 |

档案一致性约束：存在 `image` 字段 ⇔ 具备生图能力；`imageModels` 可为空（custom 档案模型由用户填写，无预设），无 `image` 档案则 `imageModels` 必须为空（单测校验）。

## 3. 配置模型与迁移

```ts
interface ProviderCreds {
  apiKey: string;
  model: string;
  imageModel: string;
  baseUrl?: string;      // 仅 custom 档案使用
}
interface AiSettings {
  enabled: boolean;
  providerId: string;                              // 默认 'ark'
  creds: Record<string, ProviderCreds>;            // 按供应商独立保存，切回不用重填
}
```

- **凭据按供应商独立保存**：切换供应商读写 `creds[providerId]`，目标条目不存在时以空字段创建，`model`/`imageModel` 自动填该档案第一个预设；
- endpoint 与协议**不再存储**，运行时由 `resolveRuntime(settings)` 查表拍平为：

```ts
interface AiRuntime {
  profile: ProviderProfile;
  baseUrl: string;        // custom 用 creds.baseUrl；needsProxy 则 '/proxy-<id>' 前缀
  apiKey: string;
  model: string;
  imageModel: string;
}
```

  aiBridge 全部函数改为接收 `AiRuntime`（引擎不感知 store 结构）；hooks 层在调用前 resolve；
- localStorage 旧结构迁移（`migrateLegacySettings`，引擎层纯函数）：
  - 含 `endpoint` 字段的旧记录：域名含 `volces.com` → `providerId:'ark'`，否则 `providerId:'custom'` 并把旧 endpoint 去掉 `/chat/completions` 后缀存入 `creds.custom.baseUrl`；
  - 旧 `apiKey/model/imageModel/enabled` 迁入对应 `creds[providerId]`。

## 4. 引擎改造（`engine/aiBridge.ts`）

- 删除 `isArkEndpoint` 域名猜测；新增 `getProfile(providerId)`（未知 id 回退 custom）；所有函数接收 `AiRuntime`（由 hooks 层 `resolveRuntime` 产出），chat 路径统一补 `/chat/completions`，images 按协议拼 `/images/generations` 或 `/images/edits`；
- `generateImage` 按 `image.protocol` 分发：
  - `ark-json`：JSON body `{ model, prompt, size, image?（dataURL）, ...extra }` → `/images/generations`；
  - `openai-multipart`：FormData（model/prompt/n/size/image?）→ `/images/edits`，404/405 降级 JSON generations（纯文生图，用 `imagePromptSolo`）；
- `testChat`/`testImage` 同样查表；档案无 `image` 时 `testImage` 返回 `{ ok:false, msg:'该供应商不支持生图' }`；
- `analyze`/`writeCopy` 接收 `AiRuntime`。

## 5. UI（`ui/components/SettingsDrawer.tsx`）

- 抽屉顶部：供应商 **chip 单选**（火山方舟 | 腾讯混元 | OpenAI | 自定义），点击即改 `providerId`；
- 字段随档案变化：
  - 混元 → 隐藏「图像模型」字段与测试按钮；
  - custom → 显示 baseUrl 输入框；
- `model`/`imageModel` 输入框挂 `<datalist>`（来自档案 `chatModels`/`imageModels`，仍可自由输入）；
- `note` 与 CORS 提示随供应商切换（代理路径统一为 `/proxy-ark/api/v3`，替代旧 `/ark-proxy`）；
- 生图相关按钮显隐（卡片「AI 图 ✨」、弹窗「AI 生成相似图 ✨」）改为 `profile.image 存在 && enabled` 判定，不再看 `imageModel` 非空。

## 6. 代理生成（`vite.config.ts`）

- `providers.ts` 保持**纯数据模块**（零 DOM/零依赖），vite.config 以相对路径导入，遍历 `needsProxy: true` 的档案自动生成：

```ts
server: {
  proxy: Object.fromEntries(
    providers.filter(p => p.needsProxy).map(p => [
      `/proxy-${p.id}`,
      { target: p.baseUrl, changeOrigin: true, rewrite: (path: string) => path.replace(`/proxy-${p.id}`, '') },
    ]),
  ),
},
```

- 仅 dev server 生效；生产部署需自行在反代加同样规则（note 中提示）。
- 移除旧 `/ark-proxy` 手写条目（本应用仅本地 dev 使用，无外部链接依赖）。

## 7. 错误处理

- 供应商能力缺失（无生图）→ UI 层直接隐藏按钮，引擎层 `testImage` 友好返回；
- 未知 `providerId`（localStorage 被手改）→ `getProfile` 回退 `custom`；
- 网络失败/CORS/超时 → 沿用现有 `errText` 透出机制与测试按钮；
- 请求失败回退行为不变（AI 调参回退固定预设、代写/生图失败仅 toast，不中断出图）。

## 8. 测试与验证

- **单测**（vitest，引擎层纯函数）：
  - 档案表完整性：id 唯一、baseUrl 以 https:// 开头、`imageModels` 与 `image` 一致性、needsProxy 档案 target 可解析；
  - `resolveRuntime`：ark（代理路径 `/proxy-ark/...`）、hunyuan（直连）、custom（用户 baseUrl）、未知 id 回退 custom，四种拼接；
  - `migrateLegacySettings`：方舟域名映射、custom 保留 baseUrl、字段保留。
- **走查**（Playwright + 本地 mock 网关）：
  - 三家供应商切换：字段显隐、datalist 内容、note 更新；
  - 混元：无生图按钮、testImage 返回不支持提示；
  - 方舟形态生图（mock /api/v3/images/generations）与 OpenAI 形态 multipart + 404 降级（mock /v1）；
  - 预置旧版 localStorage 配置 → 刷新后迁移正确、功能可用。
- `tsc --noEmit` 零错误、`npm run build` 通过。

## 9. 明确不做（YAGNI）

- 不做多供应商同时在线（文案/生图分家）；
- 不做生产环境代理方案（仅 dev）；
- 不做流式输出、工具调用等 chat 扩展；
- 不做 DeepSeek/千问等更多档案（加档案即未来扩展点，本版只做 3+1 家）。
