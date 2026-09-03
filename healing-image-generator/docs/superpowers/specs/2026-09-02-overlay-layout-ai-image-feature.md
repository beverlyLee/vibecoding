# 特性：图文叠加版式 + 背景文案 + 卡片 AI 生图/换图

日期：2026-09-02 ｜ 状态：已确认（4 项决策均经用户选择）

## 需求与决策

1. **新增「图文叠加」版式**：图片铺满整张卡片；卡片比例全局改为 2:3（1080×1620）；文字叠加在图片上；文字位置三档预设（上/中/下，ControlBar 中仅叠加版式选中时显示）。
2. **色板 → 背景**：仅改 ControlBar 标签文案，行为不变。
3. **卡片级 AI 生图**：卡片操作栏新增「AI 图」按钮，把该卡文字+当前图发给大模型生成新图，仅替换该卡图片；协议用 OpenAI images API（`{base}/images/edits`，multipart，`b64_json`，size 1024x1536≈2:3）；设置抽屉新增「图像模型」字段（如 gpt-image-1），endpoint 沿用现有 chat endpoint 去掉 `/chat/completions` 后缀。
4. **编辑弹窗新增「上传图片」**：替换当前卡片图片（仅该卡，session 内有效）。

## 设计要点

- **每卡图片覆盖**：`state.cardOverrides: Record<number, PhotoItem>`；渲染时 `renderOne` 优先取覆盖图；`generate()` 重新生成时清空覆盖。上传替换与 AI 生图都写入覆盖。
- **overlay geometry**：photo rect 铺满 (0,0,W,H)；文字区 x=W*0.07, w=W*0.86, h=H*0.36；top→y=H*0.07，center→y=H*0.32，bottom→y=H*0.57。文字加柔和阴影（rgba(0,0,0,0.45)）保证图上可读（不改变背景/色板行为）。
- **aiBridge.generateImage(prompt, imageB64|null, settings)**：无图或失败返回 null；URL 响应尝试 fetch→blob→dataURL，CORS 失败按 null 处理；超时 90s（生图慢）。
- **loadingMsg**：`SET_LOADING { loading, msg? }`，LoadingMask 显示自定义文案（AI 生图时提示）。

## 涉及文件

engine/config.ts、engine/compose.ts、engine/aiBridge.ts ｜ ui/store/state.ts、reducer.ts ｜ ui/hooks/usePhotos.ts、useGeneration.ts ｜ ui/components/{ControlBar,PreviewGrid,EditModal,SettingsDrawer,HelpModal,LoadingMask}.tsx ｜ tests 不受影响（输出尺寸无单测依赖）

## 验收

- 任一版式卡片为 1080×1620；叠加版式图铺满、文字上/中/下切换即时重渲
- 色板标签显示「背景」
- 编辑弹窗可上传替换当前卡图（仅该卡变化，其他卡不变）
- AI 未启用时「AI 图」按钮隐藏；启用但接口失败 → toast 回退不中断
- tsc 0 错误、21 单测通过、build 通过
