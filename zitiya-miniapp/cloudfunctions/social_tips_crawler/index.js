// 云函数 social_tips_crawler —— 每日定时从「真实平台热榜」拉取 + 话题过滤 → 入库
// 触发方式：微信云开发定时触发器（每天 02:00，见 config.json）
// 存储：cloud.database() collection 'social_tips'
// 数据源：uapis.cn 免费热榜聚合（微博/知乎/抖音/B站/小红书等），无需 key、服务端可抓
// 入库策略：话题(crawl_topics)过滤后的真实热条，每日最多 3 条；非系统数据 3 天 TTL 过期
// 回退：uapis 拉取失败 或 配置了话题但当天无命中 → 回退到本地语料池 pool.js（永不空库）
//
// 取舍同 daily_crawler：免费层拿到的是各平台实时热榜（泛热点），不是"社交技巧教学帖"。
// 小技巧库 现在 = 真实热点（来自大平台热榜，话题过滤）+ seed 系统兜底 的混合体。

const cloud = require('wx-server-sdk');
const { REAL_POOL } = require('./pool');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const clog = console.log.bind(console);
function logf(level, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  clog(JSON.stringify({ ts: Date.now(), level, fn: 'social_tips_crawler', msg }));
}

const HOT_BASE = 'https://uapis.cn/api/v1/misc/hotboard';
const PLATFORMS = [
  { aliases: ['weibo'], label: '微博热搜' },
  { aliases: ['zhihu'], label: '知乎热榜' },
  { aliases: ['douyin'], label: '抖音热点' },
  { aliases: ['bilibili'], label: 'B站热门' },
  { aliases: ['xiaohongshu', 'rednote', 'xhs'], label: '小红书热点' },
  { aliases: ['toutiao'], label: '头条热榜' },
];

const DEFAULT_TOPICS = ['拒绝', '情商', '沟通', '回怼', '嘴替', '社交', '相亲', '职场', '催婚', '借钱', '婆媳', '内卷', '人际关系', '高情商', '说话', '怼'];
const TTL_DAYS = 3;
const DAILY_LIMIT = 3;

// ---- 配置 ----
async function loadSceneConfig() {
  try {
    const res = await db.collection('scene_config').where({ _id: 'main' }).get();
    if (res.data.length > 0) return res.data[0];
  } catch (e) {
    logf('warn', 'scene_config 读取失败:', e.message);
  }
  return {};
}
function loadTopics(cfg) {
  const t = cfg.crawl_topics;
  if (Array.isArray(t) && t.length) return t.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

// ---- 热榜拉取 ----
function parseHot(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').trim();
    const m = s.match(/^([\d.]+)\s*(万|w|W|亿|e|E)?/);
    if (m) {
      let n = parseFloat(m[1]) || 0;
      if (m[2]) {
        if (m[2] === '万' || m[2].toLowerCase() === 'w') n *= 1e4;
        else if (m[2] === '亿' || m[2].toLowerCase() === 'e') n *= 1e8;
      }
      return Math.round(n);
    }
  }
  return 0;
}
function normalizeItems(json) {
  let arr = null;
  if (Array.isArray(json?.data)) arr = json.data;
  else if (Array.isArray(json?.result)) arr = json.result;
  else if (Array.isArray(json?.list)) arr = json.list;
  else if (Array.isArray(json)) arr = json;
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const it of arr) {
    if (!it) continue;
    const title = it.title || it.word || it.name || it.query || it.topic;
    if (!title || typeof title !== 'string') continue;
    out.push({ title: title.trim(), hot: parseHot(it.hot ?? it.num ?? it.heat ?? it.score ?? it.hot_value ?? it.hotValue), url: it.url || it.link || '' });
  }
  return out;
}
async function fetchPlatform(p) {
  for (const type of p.aliases) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${HOT_BASE}?type=${encodeURIComponent(type)}`, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const items = normalizeItems(json);
      if (items.length) {
        logf('info', `热榜[${p.label}/${type}] 拉到 ${items.length} 条`);
        return items.map((it) => ({ ...it, platform: p.label }));
      }
    } catch (e) {
      logf('warn', `热榜[${p.label}/${type}] 失败:`, e.message);
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}
async function fetchAllHot() {
  const results = await Promise.all(PLATFORMS.map(fetchPlatform));
  return results.flat();
}
function matchTopic(title, topics) {
  if (!topics.length) return null;
  const lower = title.toLowerCase();
  for (const t of topics) if (lower.includes(t.toLowerCase())) return t;
  return null;
}

// ---- 去重 / 清理 ----
async function dedupeContents(contents) {
  try {
    const res = await db.collection('social_tips').where({ content: _.in(contents) }).field({ content: true }).limit(1000).get();
    return new Set(res.data.map((d) => d.content));
  } catch (e) {
    logf('warn', '去重查询失败:', e.message);
    return new Set();
  }
}

// ---- 回退：本地语料池 ----
function pickRandom(arr, need) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < need) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event) => {
  const startTime = Date.now();
  const need = Math.max(1, Math.min(event.limit || DAILY_LIMIT, 10));
  const cfg = await loadSceneConfig();
  const topics = loadTopics(cfg);

  logf('info', `话题过滤词 ${topics.length} 个，本次上限 ${need}`);

  const all = await fetchAllHot();
  logf('info', `真实热榜共拉到 ${all.length} 条`);

  // 命中话题的优先并打标签，其余按热度排后补齐到上限
  const matched = [];
  const rest = [];
  for (const it of all) {
    const hit = topics.length ? matchTopic(it.title, topics) : null;
    if (hit) matched.push({ ...it, matchedTopic: hit });
    else rest.push(it);
  }
  rest.sort((a, b) => (b.hot || 0) - (a.hot || 0));
  const ordered = [...matched, ...rest];
  logf('info', `命中话题 ${matched.length} 条`);

  let inserted = 0;
  let usedReal = false;
  if (ordered.length) {
    const existing = await dedupeContents(ordered.map((m) => m.title));
    const toInsert = ordered.filter((m) => !existing.has(m.title)).slice(0, need);
    for (const m of toInsert) {
      const mt = m.matchedTopic || null;
      try {
        await db.collection('social_tips').add({
          data: {
            tag: mt || m.platform,
            title: m.title,
            content: m.title,
            is_system: false,
            source: 'hotlist',
            source_topic: m.platform,
            like_count: m.hot || 0,
            keywords: mt ? [mt] : [],
            platform: m.platform,
            is_real: true,
            fetched_at: Date.now(),
          },
        });
        inserted++;
      } catch (e) {
        logf('warn', '真实热条入库失败:', e.message);
      }
    }
    usedReal = true;
    logf('info', `真实热榜入库 ${inserted} 条（其中话题命中 ${toInsert.filter((m) => m.matchedTopic).length}）`);
  } else {
    logf('info', '无真实命中，回退语料池');
    const candidates = pickRandom(REAL_POOL, need + 4);
    const existing = await dedupeContents(candidates.map((t) => t.content));
    const toInsert = candidates.filter((t) => !existing.has(t.content)).slice(0, need);
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
            fetched_at: Date.now(),
            is_real: false,
          },
        });
        inserted++;
      } catch (e) {
        logf('warn', '回退入库失败:', e.message);
      }
    }
  }

  // 清理过期（仅非系统数据）
  const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
  try {
    const res = await db.collection('social_tips').where({ is_system: _.neq(true), fetched_at: _.lt(cutoff) }).remove();
    logf('info', `清理过期条目: ${res.stats?.removed || 0}`);
  } catch (e) {
    logf('warn', '清理过期失败:', e.message);
  }

  return {
    code: 0,
    message: 'ok',
    data: { source: usedReal ? 'hotlist' : 'pool_fallback', hotPulled: all.length, topicMatched: matched.length, inserted, elapsedMs: Date.now() - startTime },
  };
};
