// 云函数 daily_crawler —— 每日定时爬微博话题内容 → 过滤 → 排序 → 入库
// 触发方式：微信云开发定时触发器（每天 01:00）
// 存储：cloud.database() collection 'daily_quotes' + 'scene_config'
// 入库策略：按 (点赞数 × 0.6 + 关键词匹配度 × 0.4) 综合排序 → 取 Top N（默认 100，可配置）

const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
const { URL } = require('url');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 结构化日志：统一输出 JSON 一行，便于云开发控制台检索（ts/level/fn/msg）
const clog = console.log.bind(console);
function logf(level, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  clog(JSON.stringify({ ts: Date.now(), level, fn: 'daily_crawler', msg }));
}

// Node.js 原生 HTTP 请求（替代不存在的 cloud.httpRequest）
function nodeHttpRequest(opts) {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.url);
    const lib = url.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: opts.method || 'GET',
      headers: opts.headers || {}
    };
    const req = lib.request(reqOpts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(opts.timeout || 10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const DEFAULT_TOPICS = [
  '接话技巧', '高情商说话', '回话的技术', '怎么拒绝', '拒绝别人',
  '说话的艺术', '沟通技巧', '不尴尬拒绝', '怼人技巧', '怎么回怼', '嘴替'
];

const DEFAULT_TTL_DAYS = 7;
const DEFAULT_DAILY_LIMIT = 100; // 每天最多入库条数

// ================================================================
// 读配置（scene_config._id='main'）
// ================================================================

async function loadSceneConfig() {
  try {
    const res = await db.collection('scene_config').where({ _id: 'main' }).get();
    if (res.data.length > 0) return res.data[0];
  } catch (e) {
    logf('warn','[Crawler] scene_config 读取失败:', e.message);
  }
  return {};
}

async function loadTopics(cfg) {
  // 兼容驼峰（crawlTopics）与蛇形（crawl_topics，与前端 scene_config 文档一致）
  const custom = (cfg.crawlTopics?.length ? cfg.crawlTopics : cfg.crawl_topics) || [];
  if (custom.length > 0) {
    logf('info','[Crawler] 使用自定义话题:', custom);
    return custom;
  }
  logf('info','[Crawler] 使用默认话题:', DEFAULT_TOPICS);
  return DEFAULT_TOPICS;
}

async function loadDailyLimit(cfg) {
  const n = Number(cfg.dailyQuoteLimit || cfg.daily_quote_limit);
  if (n > 0) {
    logf('info','[Crawler] 每日入库条数:', n);
    return n;
  }
  logf('info','[Crawler] 使用默认每日条数:', DEFAULT_DAILY_LIMIT);
  return DEFAULT_DAILY_LIMIT;
}

async function loadTTLDays(cfg) {
  const d = Number(cfg.dailyQuoteTTLDays || cfg.daily_quote_ttl_days);
  if (d > 0) {
    logf('info','[Crawler] 使用自定义 TTL 天数:', d);
    return d;
  }
  return DEFAULT_TTL_DAYS;
}

// 默认意图规则
const DEFAULT_RULES = [
  { key: 'marriage', keywords: ['结婚', '找对象', '谈恋爱', '催婚', '要孩子', '生娃', '生孩子', '二胎', '相亲', '另一半', '彩礼'] },
  { key: 'privacy', keywords: ['工资', '挣多少', '赚多少', '月薪', '年薪', '买房', '买车', '存款', '年终奖', '多少钱', '房价', '考了多少分'] },
  { key: 'compare', keywords: ['你看人家', '别人家', '比不上', '不如', '差远了', '没出息', '白养', '人家孩子', '怎么就不如', '丢人'] },
  { key: 'pua_draw', keywords: ['多学习', '吃苦', '锻炼你', '培养你', '大饼', '以后给你', '年轻人要', '为公司', '奉献', '狼性', '格局', '情怀', '加班'] },
  { key: 'pua_suppress', keywords: ['不行', '太差', '能力不够', '离了平台', '你算什么', '换个地方', '没人要你', '白干了这么多年', '笨', '你就是'] },
  { key: 'blame', keywords: ['你的责任', '你怎么搞的', '都怪你', '你的问题', '因为你们', '就是你的', '你负责的', '你是干什么的'] },
  { key: 'moral', keywords: ['为你好', '我是你妈', '我是你爸', '长辈', '不孝', '白眼狼', '都是因为你', '养你这么大', '当哥的', '一家人', '别不识好歹'] },
  { key: 'drink', keywords: ['喝酒', '不喝', '感情深', '一口闷', '给面子', '不喝就是', '干了', '走一个', '喝一个', '酒品', '意思一下'] },
  { key: 'joke', keywords: ['开玩笑', '开个玩笑', '幽默', '这么开不起', '胖了', '丑', '秃', '单身狗', '取笑', '损你', '你还当真'] },
  { key: 'control', keywords: ['你必须', '听我的', '不许', '就听我的没错', '我说了算', '赶紧去', '要求你', '你得给我', '给我做', '给我改', '给我写'] },
  { key: 'borrow', keywords: ['借点', '借我', '周转', '手头紧', '救急', '借个钱', '宽限', '还钱', '欠我的'] }
];

function loadKeywordMap(cfg) {
  // 兼容驼峰与蛇形字段
  const overrides = cfg.keywordOverrides || cfg.keyword_overrides || {};
  const map = {};
  for (const r of DEFAULT_RULES) {
    map[r.key] = overrides[r.key] || r.keywords;
  }
  return map;
}

// 标注关键词 + 匹配度分数（hits 越多分数越高，封顶 10）
function annotateKeywords(content, kwMap) {
  const matched = new Set();
  let bestKey = null;
  let bestHits = 0;
  let totalHits = 0;
  for (const [intentKey, keywords] of Object.entries(kwMap)) {
    let hits = 0;
    for (const kw of keywords) {
      if (content.includes(kw)) {
        matched.add(kw);
        hits++;
        totalHits++;
      }
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestKey = intentKey;
    }
  }
  return {
    keywords: [...matched],
    intent_key: bestKey,
    useful: matched.size > 0,
    kwScore: Math.min(totalHits, 10) // 匹配度 0-10
  };
}

// ================================================================
// 微博话题爬取 + 提取点赞数
// ================================================================

// 微博数字解析（"1.2万" → 12000, "2356" → 2356）
function parseCount(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (/万/.test(s)) return Math.round(parseFloat(s) * 10000);
  if (/亿/.test(s)) return Math.round(parseFloat(s) * 100000000);
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

async function crawlWeiboTopic(topic) {
  const url = `https://s.weibo.com/weibo?q=${encodeURIComponent(topic)}&typeall=1&suball=1&timescope=custom:1:0`;

  try {
    const res = await nodeHttpRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 10000
    });

    if (!res.body) {
      logf('warn',`[Crawler] 话题「${topic}」返回空 body`);
      return [];
    }

    const items = [];

    // 先按微博卡片分块（微博话题页每个卡片有 mid 属性）
    // 模式1：class="card-main" 块里找内容和点赞
    const cardRegex = /<div[^>]*class="[^"]*card-main[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    // 模式2：兜底 —— 整个页面分块
    const fallbackRegex = /<p[^>]*class="txt[^"]*"[^>]*>([\s\S]*?)<\/p>[\s\S]{0,300}?action-type="feed_list_like"[^>]*>([\s\S]*?)<\/a>/g;

    let m;
    while ((m = cardRegex.exec(res.body)) !== null) {
      const block = m[1];
      // 提取内容
      const textMatch = block.match(/<p[^>]*class="txt[^"]*"[^>]*>([\s\S]*?)<\/p>/);
      if (!textMatch) continue;
      const clean = textMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/[\s]+/g, ' ')
        .trim();
      if (clean.length < 10 || clean.length > 200) continue;

      // 提取点赞数
      let likeCount = 0;
      const likeMatch = block.match(/action-type="feed_list_like"[^>]*>([\s\S]*?)<\/a>/);
      if (likeMatch) {
        const numMatch = likeMatch[1].match(/[\d.]+[万亿]?/);
        if (numMatch) likeCount = parseCount(numMatch[0]);
      }

      items.push({ content: clean, like_count: likeCount, source: 'weibo', source_topic: topic });
    }

    // 兜底：卡片块没匹配到就用扁平正则
    if (items.length === 0) {
      while ((m = fallbackRegex.exec(res.body)) !== null) {
        const clean = m[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/[\s]+/g, ' ')
          .trim();
        if (clean.length < 10 || clean.length > 200) continue;
        let likeCount = 0;
        const numMatch = m[2].match(/[\d.]+[万亿]?/);
        if (numMatch) likeCount = parseCount(numMatch[0]);
        items.push({ content: clean, like_count: likeCount, source: 'weibo', source_topic: topic });
      }
    }

    logf('info',`[Crawler] 话题「${topic}」提取 ${items.length} 条 (总点赞 ${items.reduce((s, i) => s + i.like_count, 0)})`);
    return items;
  } catch (e) {
    logf('warn',`[Crawler] 话题「${topic}」爬取失败:`, e.message);
    return [];
  }
}

// ================================================================
// 综合排序：归一化后加权
// ================================================================

function scoreAndSort(items) {
  if (items.length === 0) return items;

  const maxLikes = Math.max(...items.map((i) => i.like_count || 0), 1);
  const maxKw = 10; // annotateKeywords 封顶 10

  for (const item of items) {
    const likeNorm = (item.like_count || 0) / maxLikes;       // 0~1
    const kwNorm = (item.kwScore || 0) / maxKw;                // 0~1
    item.rank_score = likeNorm * 0.6 + kwNorm * 0.4;           // 点赞 60% + 关键词匹配 40%
  }

  items.sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  return items;
}

// ================================================================
// 入库 + 清理过期
// ================================================================

async function dedupeContents(contents) {
  try {
    const existing = await db.collection('daily_quotes')
      .where({ content: _.in(contents) })
      .field({ content: true })
      .limit(1000)
      .get();
    const existingSet = new Set(existing.data.map((d) => d.content));
    return contents.filter((c) => !existingSet.has(c));
  } catch (e) {
    logf('warn','[Crawler] 去重查询失败:', e.message);
    return contents;
  }
}

async function cleanupExpired(cfg) {
  const ttlDays = await loadTTLDays(cfg);
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  try {
    const res = await db.collection('daily_quotes')
      .where({ fetched_at: _.lt(cutoff) })
      .remove();
    logf('info','[Crawler] 清理过期条目:', res.stats?.removed || 0);
  } catch (e) {
    logf('warn','[Crawler] 清理过期失败:', e.message);
  }
}

// ================================================================
// 主入口
// ================================================================

exports.main = async (event, context) => {
  const startTime = Date.now();
  const cfg = await loadSceneConfig();
  const topics = event.topics || await loadTopics(cfg);
  const kwMap = loadKeywordMap(cfg);
  const dailyLimit = event.limit || await loadDailyLimit(cfg);

  logf('info',`[Crawler] 开始: ${topics.length} 个话题, 每日上限 ${dailyLimit}, keywords=${Object.keys(kwMap).length} 个意图`);

  // 1. 爬取
  const allRaw = [];
  for (const topic of topics) {
    const items = await crawlWeiboTopic(topic);
    allRaw.push(...items);
  }
  logf('info',`[Crawler] 原始爬取: ${allRaw.length} 条`);

  // 2. 关键词过滤 + 打分
  const annotated = allRaw
    .map((item) => {
      const ann = annotateKeywords(item.content, kwMap);
      return { ...item, ...ann };
    })
    .filter((item) => item.useful);

  logf('info',`[Crawler] 关键词过滤后: ${annotated.length} 条`);

  if (annotated.length === 0) {
    return { code: 0, message: 'ok (无新数据)', data: { inserted: 0, elapsedMs: Date.now() - startTime } };
  }

  // 3. 综合排序（点赞 × 0.6 + 关键词匹配度 × 0.4）→ 取 Top N
  const sorted = scoreAndSort(annotated);
  const topN = sorted.slice(0, dailyLimit);
  logf('info',`[Crawler] 排序取 Top ${topN.length} / ${sorted.length}`);

  // 4. 去重
  const newContents = await dedupeContents(topN.map((a) => a.content));
  const toInsert = topN.filter((a) => newContents.includes(a.content));

  // 5. 入库
  let inserted = 0;
  for (const item of toInsert) {
    try {
      await db.collection('daily_quotes').add({
        data: {
          content: item.content,
          source: 'weibo',
          source_topic: item.source_topic,
          keywords: item.keywords,
          intent_key: item.intent_key,
          like_count: item.like_count || 0,
          rank_score: item.rank_score || 0,
          fetched_at: Date.now()
        }
      });
      inserted++;
    } catch (e) {
      logf('warn','[Crawler] 入库失败:', e.message);
    }
  }

  // 6. 清理过期
  await cleanupExpired(cfg);

  return {
    code: 0,
    message: 'ok',
    data: {
      topics: topics.length,
      rawFetched: allRaw.length,
      afterAnnotate: annotated.length,
      sortedTop: topN.length,
      inserted,
      elapsedMs: Date.now() - startTime
    }
  };
};
