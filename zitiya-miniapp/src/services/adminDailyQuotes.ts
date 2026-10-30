// 管理后台每日语录库服务：封装 admin_daily_quotes 云函数
// 列表筛选 / 按天统计 / 删除单条

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';

const FUNC = 'admin_daily_quotes';

function call<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  return Taro.cloud
    .callFunction({
      name: FUNC,
      data: { action, ...(data || {}) },
    })
    .then((res: any) => {
      const r = res.result as CloudFuncResp<T>;
      if (!r || typeof r.code !== 'number') {
        throw new Error('云函数返回格式异常');
      }
      if (r.code !== 0) {
        const e: any = new Error(r.message || '操作失败');
        e.code = r.code;
        throw e;
      }
      return r.data as T;
    });
}

export interface DailyQuoteRow {
  _id?: string;
  content: string;
  source: string; // hotlist(真实热榜) | pool(语料池兜底) | seed(seed兜底)
  source_topic?: string;
  platform?: string;
  keywords?: string[];
  like_count?: number;
  rank_score?: number;
  fetched_at?: number;
  intent_key?: string | null;
  is_real?: boolean;
}

export interface DailyQuoteListResp {
  total: number;
  page: number;
  pageSize: number;
  list: DailyQuoteRow[];
}

export interface DailyQuoteStatItem {
  date: string;
  count: number;
}

export interface DailyQuoteStatsResp {
  days: number;
  total: number;
  daily: DailyQuoteStatItem[];
}

// 来源中文映射（与云端 source 字段对应）
export const DAILY_SOURCE_LABEL: Record<string, string> = {
  hotlist: '真实热榜',
  pool: '语料池兜底',
  seed: '种子兜底',
  all: '全部来源',
};

export function adminListDailyQuotes(params: {
  startDay?: string;
  endDay?: string;
  source?: string;
  platform?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<DailyQuoteListResp> {
  return call<DailyQuoteListResp>('list', params);
}

export function adminDailyStats(days = 14): Promise<DailyQuoteStatsResp> {
  return call<DailyQuoteStatsResp>('stats', { days });
}

export function adminRemoveDailyQuote(id: string): Promise<{ removed: number }> {
  return call<{ removed: number }>('remove', { id });
}
