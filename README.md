# vibecoding

作品集仓库，AI 辅助开发的小项目合集。

## 项目列表

- **[治愈系图片生成器](./healing-image-generator/)** — 上传照片 + 文案，一键生成风格统一的治愈系卡片（自动配色 / 多版式 / 可拖动文字 / AI 代写与生图）。访问与运行方法见其 [README](./healing-image-generator/README.md)。
- **[嘴替鸭](./zitiya-miniapp/)** — 一个帮内向者（i人）应对社交压力的话术小程序。输入别人对你说的话，自动分析意图并给出多套可直接照着说的回话（温和化解 / 幽默带过 / 直接拒绝 / 反将一军）。支持 H5 和微信小程序双端。详见 [zitiya-miniapp/README.md](./zitiya-miniapp/README.md)。

## 嘴替鸭管理后台

嘴替鸭自带一个零依赖（仅用 Node 内置 `http`）的配置 / 爬虫后台，位于 `zitiya-miniapp/admin/`：

```bash
cd zitiya-miniapp/admin
node server.js   # 默认监听 http://localhost:8787
```

浏览器打开后即可管理意图规则、金句库、出招场景、LLM 提示词、运行时参数，并手动触发一次微博话题爬虫拉取。配置以「默认常量 + patch 覆盖」模式工作，改动持久化在 `zitiya-miniapp/admin/data/scene_config.json`（含 AppSecret 的 `crawl_config.json` 已被各自 .gitignore 排除，不会入库）。
