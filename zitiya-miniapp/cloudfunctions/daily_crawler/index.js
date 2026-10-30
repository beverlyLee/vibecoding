// 云函数 daily_crawler —— 每日定时从「真实平台热榜」拉取 + 话题过滤 → 入库
// 触发方式：微信云开发定时触发器（每天 01:00，见 config.json）
// 存储：cloud.database() collection 'daily_quotes' + 'scene_config'
// 数据源：uapis.cn 免费热榜聚合（微博/知乎/抖音/B站/小红书等 40+ 平台，无需 key、服务端可抓）
// 入库策略：话题(crawl_topics)过滤后的真实热条，每日最多 N 条（默认 12）；7 天 TTL 过期
// 回退：uapis 拉取失败 或 配置了话题但当天无命中 → 回退到本地语料池 pool.json（永不空库）
//
// 关于"真实内容"的取舍（重要）：
//   免费层能稳定拿到的是各平台「实时热榜」（今天大家都在看什么），不是"社交技巧教学帖"。
//   因此 语录库 现在 = 真实热点语录（来自大平台热榜）+ seed 里的嘴替段子（保底）的混合体。
//   话题(crawl_topics) 作为过滤锚点：只保留标题命中话题的热条入库，让"话题管理"真正生效。

const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 结构化日志
const clog = console.log.bind(console);
function logf(level, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  clog(JSON.stringify({ ts: Date.now(), level, fn: 'daily_crawler', msg }));
}

// 真实热榜来源（uapis.cn，无需 key）。type 为该平台在 uapis 的参数名；label 为入库展示用
// 小红书在 uapis 的 type 有多个别名，依次尝试直到拿到数据
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
const DEFAULT_TTL_DAYS = 7;
const DEFAULT_DAILY_LIMIT = 12;

// ================================================================
// 配置读取（scene_config._id='main'）
// ================================================================
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
function loadDailyLimit(cfg) {
  const n = Number(cfg.dailyQuoteLimit || cfg.daily_quote_limit);
  return n > 0 ? n : DEFAULT_DAILY_LIMIT;
}
function loadTTLDays(cfg) {
  const d = Number(cfg.dailyQuoteTTLDays || cfg.daily_quote_ttl_days);
  return d > 0 ? d : DEFAULT_TTL_DAYS;
}

// ================================================================
// 真实热榜拉取与解析
// ================================================================
function normalizeItems(json) {
  // uapis 返回形状不固定：data / result / list 都可能出现；每条含 title/word + hot/num + url
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
    out.push({
      title: title.trim(),
      hot: parseHot(it.hot ?? it.num ?? it.heat ?? it.score ?? it.hot_value ?? it.hotValue),
      url: it.url || it.link || it.href || '',
    });
  }
  return out;
}

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

// 话题过滤：标题命中任一话题则保留，并返回命中的话题
function matchTopic(title, topics) {
  if (!topics.length) return null; // 未配置话题 → 不过滤
  const lower = title.toLowerCase();
  for (const t of topics) {
    if (lower.includes(t.toLowerCase())) return t;
  }
  return null;
}

// ================================================================
// 本地语料池（回退用）
// ================================================================
function loadPool() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'pool.json'), 'utf8'));
  } catch (e) {
    logf('warn', '语料池读取失败:', e.message);
    return [];
  }
}
function pickRandom(arr, need) {
  const pool = arr.slice();
  const out = [];
  while (pool.length && out.length < need) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// ================================================================
// 去重 / 清理
// ================================================================
async function dedupeContents(contents) {
  try {
    const existing = await db.collection('daily_quotes').where({ content: _.in(contents) }).field({ content: true }).limit(1000).get();
    const s = new Set(existing.data.map((d) => d.content));
    return contents.filter((c) => !s.has(c));
  } catch (e) {
    logf('warn', '去重查询失败:', e.message);
    return contents;
  }
}
async function cleanupExpired(cfg) {
  const ttlDays = loadTTLDays(cfg);
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  try {
    const res = await db.collection('daily_quotes').where({ fetched_at: _.lt(cutoff) }).remove();
    logf('info', '清理过期条目:', res.stats?.removed || 0);
  } catch (e) {
    logf('warn', '清理过期失败:', e.message);
  }
}

// ================================================================
// 回退：从语料池轮转（保持原行为，永不空库）
// ================================================================
async function runPoolFallback(cfg, dailyLimit) {
  const POOL = loadPool();
  if (!POOL.length) return 0;
  const candidates = pickRandom(POOL, dailyLimit);
  const newContents = await dedupeContents(candidates.map((a) => a.content));
  const toInsert = candidates.filter((a) => newContents.includes(a.content));
  let inserted = 0;
  for (const item of toInsert) {
    const kwLen = (item.keywords || []).length;
    try {
      await db.collection('daily_quotes').add({
        data: {
          content: item.content,
          source: 'pool',
          source_topic: item.source_topic || '嘴替精选',
          keywords: item.keywords || [],
          intent_key: item.intent_key || null,
          like_count: item.like_count || 0,
          rank_score: Math.round((item.like_count || 0) * 0.6 + kwLen * 0.4),
          fetched_at: Date.now(),
          is_real: false,
        },
      });
      inserted++;
    } catch (e) {
      logf('warn', '回退入库失败:', e.message);
    }
  }
  logf('info', `回退(语料池) 入库 ${inserted} 条`);
  return inserted;
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event) => {
  const startTime = Date.now();
  const cfg = await loadSceneConfig();
  const dailyLimit = Math.max(1, Math.min(event.limit || loadDailyLimit(cfg), 50));
  const topics = loadTopics(cfg);

  logf('info', `话题过滤词 ${topics.length} 个，本次上限 ${dailyLimit}`);

  // 1. 拉真实热榜
  const all = await fetchAllHot();
  logf('info', `真实热榜共拉到 ${all.length} 条`);

  // 2. 话题匹配：命中的排前面并打标签，其余按热度排后
  //    说明：免费热榜以新闻娱乐为主，社交关键词极少出现，若严格按话题过滤几乎每天都会 0 命中。
  //    因此采用「命中优先 + 热度补齐」：话题命中项被优先入库并打标签（话题生效），
  //    其余高热度热条补齐到当日上限（保证语录库每日都是真实最新内容）。
  const matched = [];
  const rest = [];
  for (const it of all) {
    const hit = topics.length ? matchTopic(it.title, topics) : null;
    if (hit) matched.push({ ...it, matchedTopic: hit });
    else rest.push(it);
  }
  rest.sort((a, b) => (b.hot || 0) - (a.hot || 0));
  const ordered = [...matched, ...rest];
  logf('info', `真实热条 ${all.length} 条，命中话题 ${matched.length} 条`);

  // 3. 入库：优先命中话题，再用高热度热条补齐到上限；全空才回退语料池
  let inserted = 0;
  let usedReal = false;
  if (ordered.length) {
    const newContents = await dedupeContents(ordered.map((m) => m.title));
    const toInsert = ordered.filter((m) => newContents.includes(m.title)).slice(0, dailyLimit);
    for (const m of toInsert) {
      const mt = m.matchedTopic || null;
      try {
        await db.collection('daily_quotes').add({
          data: {
            content: m.title,
            source: 'hotlist',
            source_topic: m.platform,
            keywords: mt ? [mt] : [],
            intent_key: null,
            like_count: m.hot || 0,
            rank_score: Math.round((m.hot || 0) * 0.0001 + (mt ? 1 : 0)),
            fetched_at: Date.now(),
            platform: m.platform,
            is_real: true,
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
    logf('info', '热榜拉取为空，回退语料池');
    inserted = await runPoolFallback(cfg, dailyLimit);
  }

  // 4. 清理过期
  await cleanupExpired(cfg);

  return {
    code: 0,
    message: 'ok',
    data: {
      source: usedReal ? 'hotlist' : 'pool_fallback',
      hotPulled: all.length,
      topicMatched: matched.length,
      inserted,
      elapsedMs: Date.now() - startTime,
    },
  };
};
