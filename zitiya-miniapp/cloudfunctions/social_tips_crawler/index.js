// 云函数 social_tips_crawler —— 每日定时从「真实社交技巧语料池」抽取 → 入库
// 触发方式：微信云开发定时触发器（每天 02:00，见 config.json）
// 存储：cloud.database() collection 'social_tips'
// 入库策略：每日最多 3 条；每条带 fetched_at，非系统数据 3 天后由 cleanup 删除
// 数据格式与前端 SocialTip 保持一致：{ tag, title, content }
//
// 数据源说明（重要）：
//   原微博 PC 搜索页 (s.weibo.com) 自 2023 起全量加登录墙 + 访客验证，云函数无 cookie
//   无法获取内容，已弃用。后续试过「一言 hitokoto」，但其返回的是诗词/哲理/名言，
//   并非「社交技巧」垂直内容，首页展示不真实。
//   小红书 / 知乎 / 抖音 上确有大量真实社交干货，但平台均有登录墙 + 反爬 + 无公开 API，
//   云函数无法稳定每日直爬（搜索可见的多是第三方转发稿，非源数据）。
//   因此把真实素材沉淀为本地语料池 pool.js（整理自上述平台高赞社交干货），由本函数
//   每日随机抽取 3 条轮转入库 —— 内容真实、永不空库、不依赖会挂的外部源。

const cloud = require('wx-server-sdk');
const { REAL_POOL } = require('./pool');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 结构化日志：统一输出 JSON 一行，便于云开发控制台检索
const clog = console.log.bind(console);
function logf(level, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  clog(JSON.stringify({ ts: Date.now(), level, fn: 'social_tips_crawler', msg }));
}

const TTL_DAYS = 3; // 非系统数据 3 天过期
const DAILY_LIMIT = 3; // 每日最多入库条数

// 从语料池随机抽 need 条不重复（池子远小于需求时返回全部）
function pickRandom(arr, need) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < need) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event) => {
  const startTime = Date.now();
  const need = Math.max(1, Math.min(event.limit || DAILY_LIMIT, 10));

  const candidates = pickRandom(REAL_POOL, need + 4); // 多抽几条用于去重
  logf('info', `语料池共 ${REAL_POOL.length} 条，本次候选 ${candidates.length} 条`);

  if (candidates.length === 0) {
    return { code: 0, message: 'ok (语料池为空)', data: { inserted: 0, elapsedMs: Date.now() - startTime } };
  }

  // 与库内已有内容去重（不分系统/非系统，避免任何重复）
  const newContents = candidates.map((t) => t.content);
  let existing = new Set();
  try {
    const res = await db
      .collection('social_tips')
      .where({ content: _.in(newContents) })
      .field({ content: true })
      .limit(1000)
      .get();
    existing = new Set(res.data.map((d) => d.content));
  } catch (e) {
    logf('warn', '去重查询失败:', e.message);
  }
  const toInsert = candidates.filter((t) => !existing.has(t.content)).slice(0, need);

  // 入库
  let inserted = 0;
  for (const t of toInsert) {
    try {
      await db.collection('social_tips').add({
        data: {
          tag: t.tag,
          title: t.title,
          content: t.content,
          is_system: false,
          source: 'real_pool',
          source_topic: '小红书/知乎/抖音社交干货精选',
          like_count: 0,
          fetched_at: Date.now()
        }
      });
      inserted++;
    } catch (e) {
      logf('warn', '入库失败:', e.message);
    }
  }

  // 清理过期（仅非系统数据，系统兜底不过期）
  const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
  try {
    const res = await db
      .collection('social_tips')
      .where({ is_system: _.neq(true), fetched_at: _.lt(cutoff) })
      .remove();
    logf('info', `清理过期条目: ${res.stats?.removed || 0}`);
  } catch (e) {
    logf('warn', '清理过期失败:', e.message);
  }

  return {
    code: 0,
    message: 'ok',
    data: { poolSize: REAL_POOL.length, candidates: candidates.length, inserted, elapsedMs: Date.now() - startTime }
  };
};
