// 每日拉取库（Layer 2）：走后端 FastAPI /api/quotes + 前端 7 天滚动缓存

import Taro from '@tarojs/taro';
import type { Quote } from '@/data/quotes';
import { apiGet } from '@/services/api';

const DAILY_CACHE_KEY = 'zuitiya_daily_quotes';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

interface DailyQuoteCache {
  quotes: Quote[];
  lastFetchedAt: number;
}

export function isTodayFetched(): boolean {
  const cache = loadDailyCache();
  if (!cache?.lastFetchedAt) return false;
  const now = new Date();
  const last = new Date(cache.lastFetchedAt);
  return last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth() && last.getDate() === now.getDate();
}

/**
 * 拉取每日语录：调后端 GET /api/quotes
 * 后端已完成 爬虫→关键词过滤→综合排序→Top N，前端只做二次 annotate + 去重
 * 后端没跑起来就返回 []
 */
export async function fetchDailyQuotes(): Promise<Quote[]> {
  try {
    const rows = await apiGet<any[]>("/api/quotes?limit=100");
    if (!rows || rows.length === 0) {
      console.log("[QuoteCache] 后端 /api/quotes 返回 0 条（爬虫可能还没跑）");
      return [];
    }
    const quotes: Quote[] = rows.map((r) => ({
      id: `q_daily_${r.id}`,
      content: r.content,
      source: "daily",
      category: "社区热话",
      keywords: Array.isArray(r.keywords) ? r.keywords : [],
      intent_key: r.intent_key || null,
      fetched_at: r.fetched_at ? new Date(r.fetched_at).getTime() : Date.now(),
      like_count: r.like_count,
      rank_score: r.rank_score,
      note: r.source_topic ? `来自 ${r.source_topic}` : undefined,
    }));
    console.log("[QuoteCache] 后端返回", quotes.length, "条");
    return quotes;
  } catch (err) {
    console.warn("[QuoteCache] 后端不可达:", err instanceof Error ? err.message : err);
    return [];
  }
}

export function loadDailyCache(): DailyQuoteCache | null {
  try {
    const raw = Taro.getStorageSync(DAILY_CACHE_KEY);
    if (!raw) return null;
    const cache: DailyQuoteCache = typeof raw === 'string' ? JSON.parse(raw) : raw;

    const now = Date.now();
    const fresh = cache.quotes.filter(
      (q) => q.fetched_at && now - q.fetched_at < CACHE_TTL_MS
    );

    if (fresh.length < cache.quotes.length) {
      console.log(`[QuoteCache] 清理过期语录: ${cache.quotes.length - fresh.length} 条, 剩余 ${fresh.length} 条`);
      const trimmed = { quotes: fresh, lastFetchedAt: cache.lastFetchedAt };
      Taro.setStorageSync(DAILY_CACHE_KEY, JSON.stringify(trimmed));
      return trimmed;
    }
    return cache;
  } catch (err) {
    console.warn('[QuoteCache] 读取缓存失败:', err);
    return null;
  }
}

export function saveDailyCache(data: DailyQuoteCache): void {
  try {
    Taro.setStorageSync(DAILY_CACHE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[QuoteCache] 写入缓存失败:', err);
  }
}

/**
 * 拉取新语录并追加到缓存（7 天滚动窗口）
 */
export async function ensureDailyQuotes(force = false): Promise<Quote[]> {
  if (!force) {
    const cache = loadDailyCache();
    const today = new Date();
    const last = cache?.lastFetchedAt ? new Date(cache.lastFetchedAt) : null;
    const sameDay = last
      ? last.getFullYear() === today.getFullYear() &&
        last.getMonth() === today.getMonth() &&
        last.getDate() === today.getDate()
      : false;

    if (sameDay && cache && cache.quotes.length > 0) {
      console.log('[QuoteCache] 今日已拉取, 跳过, 缓存共', cache.quotes.length, '条');
      return cache.quotes;
    }
  }

  const newQuotes = await fetchDailyQuotes();
  if (newQuotes.length === 0) {
    const cache = loadDailyCache();
    return cache?.quotes || [];
  }

  const existing = loadDailyCache()?.quotes || [];
  const existingContents = new Set(existing.map((q) => q.content));
  const fresh = [...existing];
  let added = 0;
  for (const q of newQuotes) {
    if (!existingContents.has(q.content)) {
      fresh.push(q);
      added++;
    }
  }

  saveDailyCache({ quotes: fresh, lastFetchedAt: Date.now() });
  console.log(`[QuoteCache] 追加完成: 新增 ${added} 条, 总计 ${fresh.length} 条`);
  return fresh;
}
