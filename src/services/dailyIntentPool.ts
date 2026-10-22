// 每日语录池（Layer 2）
// 从 quoteCache 的每日语录中做两件事：
//  1. 意图判定：用 intent_key / keywords 匹配用户输入
//  2. 推荐金句：匹配到的语录 content 直接当金句输出

import type { Quote } from '@/data/quotes';
import { loadDailyCache } from '@/services/quoteCache';

export interface DailyPoolMatch {
  // 命中的语录（完整对象），直接取 content 就能当金句
  matchedQuotes: Quote[];
  // 命中的 intent_key（爬虫打的标签），可以映射到固定意图
  hitIntentKeys: string[];
  // 命中的 keywords（用于日志）
  hitKeywords: string[];
}

// 内存缓存，TTL 1 分钟
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;
let _cachedQuotes: Quote[] | null = null;

function getFreshDailyQuotes(): Quote[] {
  const now = Date.now();
  if (_cachedQuotes && now - _cacheTime < CACHE_TTL_MS) {
    return _cachedQuotes;
  }
  const cache = loadDailyCache();
  _cachedQuotes = cache?.quotes || [];
  _cacheTime = now;
  return _cachedQuotes;
}

/**
 * L2 层匹配：在每日语录池中找和用户输入相关的语录
 * 匹配条件（满足任一条就算命中）：
 *  - 语录 intent_key 非空（爬虫已归类，直接命中）
 *  - 语录 keywords 与输入有交集
 *  - 语录 content 与输入有共同关键词（简单双向包含）
 */
export function matchInDailyPool(text: string): DailyPoolMatch {
  const quotes = getFreshDailyQuotes();
  const matched: Quote[] = [];
  const hitIntentKeys = new Set<string>();
  const hitKeywords = new Set<string>();

  for (const q of quotes) {
    // 条件 1：有 intent_key
    const hasIntent = !!q.intent_key;

    // 条件 2/3：keywords 或 content 有交集
    let kwHit = false;
    for (const kw of q.keywords || []) {
      if (kw && text.includes(kw)) {
        hitKeywords.add(kw);
        kwHit = true;
      }
    }

    if (hasIntent || kwHit) {
      matched.push(q);
      if (q.intent_key) hitIntentKeys.add(q.intent_key);
    }
  }

  // 按意图分组 count + keywords 命中数粗排序
  matched.sort((a, b) => {
    const bk = (b.keywords || []).filter((k) => text.includes(k)).length;
    const ak = (a.keywords || []).filter((k) => text.includes(k)).length;
    return bk - ak;
  });

  console.log(
    `[DailyPool] 匹配完成: 输入 ${text.length} 字 → 命中 ${matched.length} 条语录, ${hitIntentKeys.size} 个 intent_key, ${hitKeywords.size} 个关键词`
  );

  return {
    matchedQuotes: matched.slice(0, 5),
    hitIntentKeys: Array.from(hitIntentKeys),
    hitKeywords: Array.from(hitKeywords),
  };
}

/** 每日语录池有没有数据（用来快速判断 L2 是否可用） */
export function hasDailyPool(): boolean {
  return getFreshDailyQuotes().length > 0;
}
