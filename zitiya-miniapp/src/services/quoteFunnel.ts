// 语录金句漏斗：固定库 → 每日库，分层查询，不再用 LLM 生成
// 固定库是作者手写 + 用户自定义的经典语录；
// 每日库是社区爬虫拉的热话语录（缓存 7 天）。
//
// 和"意图判定三层漏斗"无关 —— 这里只负责捞相关金句，追加到回话末尾当推荐。

import type { Quote } from '@/data/quotes';
import { getAllFixedQuotes, getAllUserQuotes, getAllKeywordMap, initUserQuotes } from '@/services/sceneConfig';
import { loadDailyCache } from '@/services/quoteCache';

export interface FunnelResult {
  quotes: Quote[];
  hitLayer: 'fixed' | 'daily';
  costMs: number;
}

/**
 * 判断单条语录是否和用户输入相关
 * 简化匹配：intent_key 精准命中，或者语录 keywords / content 和输入有关键词交集
 */
function isRelated(quote: Quote, utterance: string, matchedIntentKey?: string): boolean {
  // 1. intent_key 精准匹配（最高相关）
  if (matchedIntentKey && quote.intent_key === matchedIntentKey) return true;

  // 2. 语录自带 keywords 命中
  for (const kw of quote.keywords || []) {
    if (kw && utterance.includes(kw)) return true;
  }

  // 3. 双向命中：输入里的意图关键词也出现在语录 content 里
  const kwMap = getAllKeywordMap();
  for (const kws of Object.values(kwMap)) {
    for (const kw of kws) {
      if (kw && utterance.includes(kw) && quote.content.includes(kw)) return true;
    }
  }

  return false;
}

// ========== 漏斗入口 ==========

/**
 * 引擎场景入口：给定原话 + 已识别的意图 key，按固定库 → 每日库顺序查相关金句
 * 仅两层，不再调 LLM
 */
export async function funnelForEngine(
  utterance: string,
  intentKey?: string
): Promise<FunnelResult | null> {
  const start = Date.now();

  // 确保用户语录已加载（未登录会降级为空数组，不阻塞）
  await initUserQuotes();

  // Layer 1: 固定库 + 用户自建语录，合并匹配不区分来源
  const fixedList = getAllFixedQuotes();
  const userList = getAllUserQuotes();
  const layer1 = [...fixedList, ...userList];
  const l1hits = layer1.filter((q) => isRelated(q, utterance, intentKey));
  if (l1hits.length > 0) {
    const userHitCount = l1hits.filter((q) => q.source === 'user').length;
    const msg = userHitCount > 0
      ? `命中固定+用户语录 (${l1hits.length}条, 含用户自建${userHitCount}条)`
      : `命中固定金句库 (${l1hits.length}条)`;
    console.log(`[Funnel] ✅ ${msg}, 耗时 ${Date.now() - start}ms`);
    return { quotes: l1hits.slice(0, 3), hitLayer: 'fixed', costMs: Date.now() - start };
  }

  // Layer 2: 每日库
  const cache = loadDailyCache();
  const dailyQuotes = cache?.quotes || [];
  const daily = dailyQuotes.filter((q) => isRelated(q, utterance, intentKey));
  if (daily.length > 0) {
    console.log(`[Funnel] ✅ 命中每日金句库 (${daily.length}条), 耗时 ${Date.now() - start}ms`);
    return { quotes: daily.slice(0, 3), hitLayer: 'daily', costMs: Date.now() - start };
  }

  console.log(`[Funnel] L1(固定+用户) + 每日库均无匹配, 耗时 ${Date.now() - start}ms`);
  return null;
}

/**
 * 语录页浏览场景入口：固定库 + 用户自建 + 每日库，合并展示 + 搜索过滤
 * 登录态下自动拉用户语录，未登录时用户语录为空
 */
export async function funnelForBrowse(searchKeyword?: string): Promise<Quote[]> {
  // 确保用户语录已加载
  await initUserQuotes();

  let all: Quote[] = [...getAllFixedQuotes(), ...getAllUserQuotes()];

  const cache = loadDailyCache();
  if (cache && cache.quotes.length > 0) {
    all = all.concat(cache.quotes);
  }

  if (searchKeyword && searchKeyword.trim()) {
    const kw = searchKeyword.trim();
    all = all.filter(
      (q) =>
        q.content.includes(kw) ||
        q.category.includes(kw) ||
        (q.keywords?.some((k) => k.includes(kw)) ?? false) ||
        q.note.includes(kw)
    );
  }

  return all;
}
