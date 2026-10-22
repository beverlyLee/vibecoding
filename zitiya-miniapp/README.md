# 嘴替鸭 🦆

专帮内向者（i人）应对社交压力的话术小程序。输入别人对你说的话，自动看穿意图，给出多套能直接照着说的回话。

- 微信小程序 / H5 双端（Taro + React + TypeScript）
- 规则引擎秒回，大模型兜底（豆包 / 火山引擎等）
- 三层意图漏斗：固定规则 → 每日语录 → LLM
- 四类回话风格：温和化解 / 幽默带过 / 直接拒绝 / 反将一军

## 快速开始

```bash
# 安装依赖
npm install

# H5 开发（默认 http://localhost:10086）
npm run dev:h5

# 微信小程序开发
npm run dev:weapp
# 然后用微信开发者工具打开 dist/ 目录

# 构建
npm run build:h5      # H5
npm run build:weapp   # 微信小程序
```

## 项目结构

```
zitiya-miniapp/
├── src/
│   ├── services/        # 核心业务
│   │   ├── engine.ts          # 意图识别 + 回话生成引擎
│   │   ├── sceneConfig.ts     # 意图规则 / LLM prompt 中枢
│   │   ├── llm.ts             # 大模型调用封装
│   │   ├── quoteFunnel.ts     # 语录金句漏斗（固定 + 每日两层）
│   │   ├── quoteCache.ts      # 每日语录缓存
│   │   ├── dailyIntentPool.ts # 每日热词池
│   │   ├── contentFilter.ts   # 内容安全审查（黑名单）
│   │   ├── storage.ts         # 本地存储
│   │   ├── speech.ts          # 语音识别（预留）
│   │   └── api.ts             # 后端接口
│   ├── data/            # 静态数据
│   │   ├── intents.ts         # 12 个默认意图规则 + 回话模板
│   │   ├── quotes.ts          # 固定金句库
│   │   └── attackScenes.ts    # 出招场景分类
│   ├── pages/           # 页面（Taro）
│   │   ├── defend/            # 拆招页（核心）
│   │   ├── attack/            # 出招页
│   │   ├── quotes/            # 语录页
│   │   └── settings/          # 设置页（LLM 配置）
│   ├── components/      # 通用组件
│   ├── store/           # Zustand 全局状态
│   └── types/           # 类型定义
├── backend/             # Python FastAPI 后端 + SQLite
│   ├── main.py                # 应用入口
│   ├── config_store.py        # 配置读写
│   ├── crawler.py             # 社区热话爬虫
│   └── scheduler.py           # 定时拉取
├── admin/               # Node 管理后台（爬虫 + 配置管理）
└── cloudfunctions/       # 微信云函数（未部署，留作参考）
```

## 意图识别三层漏斗

```
用户输入
  │
  ├─ L1 固定规则（12 个默认意图 + 用户自定义）
  │    关键词匹配 + weight×hits 评分排序
  │    命中 → 用该意图的 4 风格模板秒回，不调 LLM
  │
  ├─ L2 每日语录池（社区爬虫热话语录）
  │    intent_key 或 keywords 匹配
  │    有完整 content → 当推荐金句追加
  │    content 空洞 → generic 兜底（不调 LLM）
  │
  └─ L3 大模型（需用户在设置里配置）
       识别意图 + 生成 4 风格回话，最多返回 5 个意图标签
       未配置 LLM → 通用兜底模板 + 引导去设置页
```

## 语录金句管道（独立）

```
L1 固定金句库（手写 + 用户自定义）
  └─ intent_key 或 keywords 相关 → 追加
L2 每日金句库（社区爬虫）
  └─ 相关 → 追加；无匹配则不加
```

两层都不走 LLM。

## LLM Prompt（当前在用）

| Prompt key | 用途 | 调用方 |
|---|---|---|
| `analyze` | 意图识别 + 4 风格回话生成 | engine L3 层，唯一触发的 LLM 意图判定 |
| `rewrite` + `rephraseUser` | 用户点击「换个说法」时改写单条回话 | 拆招页换说法按钮 |

废弃的 `quoteGen` 系列已删除。

## 自定义扩展

- **新增意图**：设置页 → 意图规则 → 新增，写 key / 关键词 / weight / 4 风格回话
- **新增金句**：设置页 → 语录库 → 新增，带 intent_key 或 keywords
- **配置 LLM**：设置页 → 大模型配置，支持火山引擎豆包 / 其他 OpenAI 兼容接口

## 内容安全

所有输出在返回前过一遍黑名单（[contentFilter.ts](./src/services/contentFilter.ts)），拦截暴力、辱骂、自残、歧视、犯罪、极端表达等。
