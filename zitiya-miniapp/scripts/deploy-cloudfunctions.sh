#!/usr/bin/env bash
#
# 云函数部署脚本（基于 CloudBase CLI：tcb）
# 前置：npm i -g @cloudbase/cli；本地先 tcb login，CI 用 tcb login --apiKeyId/--apiKey
#
# 用法：
#   ENV_ID=your-env-id ./scripts/deploy-cloudfunctions.sh
#
set -euo pipefail

ENV_ID="${ENV_ID:?请设置云开发环境 ENV_ID（微信开发者工具 → 云开发 → 环境设置）}"

FUNCS=(daily_crawler get_daily_quotes)

for fn in "${FUNCS[@]}"; do
  echo "▶ 部署云函数 $fn (env=$ENV_ID，云端安装依赖)"
  tcb fn deploy "$fn" \
    -e "$ENV_ID" \
    --dir "cloudfunctions/$fn" \
    --install-dependency true \
    --yes
done

echo "✅ 云函数部署完成。请到云开发控制台确认 daily_crawler 的定时触发器已生效"
