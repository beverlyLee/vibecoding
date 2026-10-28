// 小程序端「我的语录」服务：封装 user_quotes 云函数
// 全链路带 console.log，方便排查"编辑不存在"之类的问题

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';
import type { Quote } from '@/data/quotes';
import { logger } from '@/utils/logger';

const FUNC = 'user_quotes';

function call<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  const payload = { action, ...(data || {}) };
  logger.debug(`[Cloud.${FUNC}] → ${action}`, { keys: Object.keys(data || {}) });
  return Taro.cloud.callFunction({
    name: FUNC,
    data: payload,
  }).then((res: any) => {
    const r = res.result as CloudFuncResp<T>;
    logger.debug(`[Cloud.${FUNC}] ← ${action} code=${r?.code} msg=${r?.message}`);
    if (!r || typeof r.code !== 'number') {
      throw new Error('user_quotes 返回格式异常');
    }
    if (r.code !== 0) {
      const err: any = new Error(r.message || '操作失败');
      err.code = r.code;
      throw err;
    }
    return r.data as T;
  }).catch((e: any) => {
    logger.error(`[Cloud.${FUNC}] ✘ ${action} 异常:`, e?.message || e);
    throw e;
  });
}

export interface UserQuoteInput {
  content: string;
  category?: string;
  note?: string;
  keywords?: string[];
  author?: string;
  intent_key?: string;
}

export function userQuotesList(): Promise<Quote[]> {
  return call<Quote[]>('list');
}

export function userQuotesAdd(input: UserQuoteInput): Promise<Quote> {
  return call<Quote>('add', input as unknown as Record<string, unknown>);
}

export function userQuotesUpdate(id: string, patch: Partial<UserQuoteInput>): Promise<Quote> {
  if (!id || typeof id !== 'string') {
    logger.error('[userQuotesUpdate] ❌ id 无效:', id);
    return Promise.reject(new Error('缺少语录 id'));
  }
  logger.debug('[userQuotesUpdate] id=', id, 'patchKeys=', Object.keys(patch || {}));
  return call<Quote>('update', { id, ...patch } as unknown as Record<string, unknown>);
}

export function userQuotesRemove(id: string): Promise<{ id: string }> {
  if (!id || typeof id !== 'string') {
    return Promise.reject(new Error('缺少语录 id'));
  }
  return call<{ id: string }>('remove', { id });
}
