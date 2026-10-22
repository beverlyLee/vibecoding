#!/usr/bin/env bash
#
# 微信小程序上传脚本（基于 miniprogram-ci）
# 前置：npm i -D miniprogram-ci；并在微信公众平台下载上传私钥 .key
#
# 用法：
#   APPID=wx17195c3a70827174 KEY_PATH=./private.key \
#   VERSION=1.0.0 DESC="发布说明" ./scripts/upload-miniprogram.sh
#
set -euo pipefail

APPID="${APPID:-wx17195c3a70827174}"
KEY_PATH="${KEY_PATH:-./private.key}"        # 微信公众平台下载的上传私钥
PROJECT_PATH="${PROJECT_PATH:-.}"            # 含 project.config.json 的目录（默认仓库根）
VERSION="${VERSION:-$(date +%Y%m%d.%H%M)}"   # 版本号；生产建议显式传语义化版本
DESC="${DESC:-CI 自动上传}"
ROBOT="${ROBOT:-1}"                          # CI 机器人编号 1-30，避免与他人冲突

if [ ! -f "$KEY_PATH" ]; then
  echo "❌ 找不到上传私钥：$KEY_PATH" >&2
  echo "请到微信公众平台 → 开发管理 → 开发设置 → 代码上传 → 下载上传密钥" >&2
  exit 1
fi

echo "▶ 构建微信小程序生产包 (build:weapp)"
npm run build:weapp

echo "▶ 上传到微信 (appid=$APPID, version=$VERSION)"
npx miniprogram-ci upload \
  --pp "$PROJECT_PATH" \
  --pkp "$KEY_PATH" \
  --appid "$APPID" \
  --uv "$VERSION" \
  --ud "$DESC" \
  --r "$ROBOT"

echo "✅ 上传完成。请到微信公众平台 → 版本管理 提交审核并发布"
