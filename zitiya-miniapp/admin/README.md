# 嘴替鸭 · 后台管理系统

集中管理嘴替鸭小程序的「可配置项」：意图 / 关键词 / 固定语录 / 爬虫话题 / 出招场景 / 模型厂商 / 提示词 / 漏斗参数 / 模型参数 / 每日语录 TTL。
零依赖，**仅用 Node 内置模块**，无需 `npm install`。

## 启动

```bash
cd admin
node server.js
# 或
npm start
```

打开 http://localhost:8787

默认端口 8787，可用环境变量改：`ADMIN_PORT=9000 node server.js`

## 配置来源

后台的「默认值」**直接提取小程序源码**（启动时解析，非手抄，避免漂移）：

- `src/data/intents.ts` → `INTENT_RULES`
- `src/data/quotes.ts` → `QUOTES`
- `src/types/settings.ts` → `LLM_PRESETS`
- `src/services/sceneConfig.ts` → `DEFAULT_PROMPTS` / `DEFAULT_CRAWL_TOPICS`
- `src/data/attackScenes.ts` → `ATTACK_SCENES` / `ATTACK_CATEGORIES`
- `src/services/sceneConfig.ts` → `DEFAULT_MODEL_PARAMS`（温度/maxTokens/超时，按用途档位） / `DEFAULT_DAILY_TTL_DAYS`（每日语录 TTL 默认 7 天）

你的改动以 **patch** 形式保存到 `admin/data/scene_config.json`，schema 与小程序 LocalStorage 的 `zuitiya_scene_config` 完全一致。

## 让配置生效到小程序

后台改完 → 点「导入/导出」Tab → 下载对应文件 → 贴回：

1. **改小程序运行时**（意图/关键词/语录/提示词/厂商/漏斗/出招场景/模型参数/每日TTL）：
   微信开发者工具 → Storage → 键 `zuitiya_scene_config` → 粘贴导出的 LocalStorage JSON → 刷新。
2. **改每日爬虫话题/关键词**：
   云开发控制台 → 数据库 → 集合 `scene_config` → 写入/覆盖 `_id=main` 的文档（用导出的「云数据库文档」）。

> API Key 不进后台：厂商预设只含公开配置（baseURL/模型），密钥仍保留在用户手机本地。

## 目录结构

```
admin/
├── server.js              # 零依赖 HTTP 服务 + REST 路由 + 静态资源
├── package.json
├── lib/
│   ├── extract.js         # 从 .ts 提取 export const 字面量（带字符串/模板串感知）
│   └── model.js           # 默认值 + patch 合并 + 全部增删改查/导出逻辑
├── public/                # 管理面板前端（原生 ES 模块，无构建）
│   ├── index.html         # type="module" 加载 app.js
│   ├── app.js             # 入口引导：import 各模块 + App.init()
│   ├── core.js            # App 外壳：init/go/render 调度/onClick 调度/modal/esc/toast/download
│   ├── intents.js         # 意图管理（render + 弹窗 + 保存）
│   ├── quotes.js          # 固定语录
│   ├── topics.js          # 爬虫话题 + 立即抓取（crawl 面板 / 轮询 / 凭据配置）
│   ├── attack.js          # 出招场景库 + 分类
│   ├── presets.js         # 模型厂商预设
│   ├── prompts.js         # 提示词覆盖
│   ├── funnel.js          # 漏斗参数
│   ├── runtime.js         # 模型参数 / 每日 TTL / 每日入库上限
│   ├── io.js              # 导入 / 导出
│   └── styles.css
├── data/                  # patch 持久化（自动生成 scene_config.json）
├── 配置化分析.md           # 已可配置项 / 本次新增 / 仍可配置化候选
└── README.md
```

## REST 速查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/overview` | 配置概览 |
| GET/POST | `/api/intents` | 意图列表 / 新增 |
| PUT/DELETE | `/api/intents/:key` | 编辑 / 删除（默认意图=还原） |
| POST/PUT | `/api/intents/:key/keywords` | 关键词增删 / 覆盖 |
| GET/POST/DELETE | `/api/quotes` `(/:id)` | 固定语录 |
| GET/PUT/POST/DELETE | `/api/topics` `(/:topic)` | 爬虫话题 |
| GET/POST/PUT/DELETE | `/api/attack-scenes` `(/:id)` | 出招场景（开场话术+谈话闭环） |
| GET/POST/PUT/DELETE | `/api/attack-categories` `(/:cat)` | 出招分类（「全部」保留不可删） |
| GET/POST/PUT/DELETE | `/api/presets` `(/:key)` | 模型厂商 |
| GET/PUT/DELETE | `/api/prompts` `(/:key)` | 提示词 |
| GET/PUT | `/api/funnel` | 漏斗参数 |
| GET/PUT/DELETE | `/api/model-params` `(/:purpose)` | 模型参数（档位 default/analyze/quoteGen/rephrase/test） |
| GET/PUT | `/api/daily-ttl` | 每日语录 TTL（天） |
| GET | `/api/check?utterance=...` | 意图匹配模拟 |
| GET | `/api/export/localstorage` `/api/export/clouddb` | 导出 |
| POST | `/api/import` | 导入 patch |
