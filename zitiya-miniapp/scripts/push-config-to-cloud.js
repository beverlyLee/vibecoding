#!/usr/bin/env node
/**
 * 从本地 admin/data/scene_config.json 读取配置，推到云数据库 scene_config 集合
 * 用法：node scripts/push-config-to-cloud.js
 * 依赖：tcb CLI（需先 npm i -g @cloudbase/cli 并 tcb login）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, '..', 'admin', 'data', 'scene_config.json');
const ENV_ID = process.env.CLOUD_ENV || 'cloud1';

function main() {
  // 1. 读本地配置
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 找不到配置文件:', CONFIG_PATH);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  cfg._id = 'main';
  console.log('📦 读取配置:', CONFIG_PATH);
  console.log('   - customQuotes:', cfg.customQuotes?.length || 0, '条');
  console.log('   - customIntents:', cfg.customIntents?.length || 0, '个');
  console.log('   - crawlTopics:', cfg.crawlTopics?.length || 0, '个');

  // 2. 用 tcb CLI 写云数据库
  try {
    const payload = JSON.stringify(cfg);
    execSync(
      `tcb db:put scene_config '${payload}' --envId ${ENV_ID}`,
      { stdio: 'inherit' }
    );
    console.log(`\n✅ 已推到云数据库 scene_config（env: ${ENV_ID}）`);
  } catch (e) {
    console.error('\n❌ 推送失败');
    console.error('请确认已安装 tcb CLI 并登录：');
    console.error('  npm i -g @cloudbase/cli');
    console.error('  tcb login');
    process.exit(1);
  }
}

main();
