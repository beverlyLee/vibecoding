// 管理后台「我的语录库」服务：封装 admin_user_quotes 云函数
// 跨用户列出每个用户自己录入的语录 / 按用户维度统计 / 删除单条

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';

const FUNC = 'admin_user_quotes';

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

export interface UserQuoteRow {
  _id?: string;
  content: string;
  category: string;
  note?: string;
  keywords?: string[];
  author?: string;
  intent_key?: string;
  openid?: string;
  nickname?: string;
  avatar?: string;
  createdAt?: number;
}

export interface UserQuoteStatItem {
  openid: string;
  nickname: string;
  avatar: string;
  count: number;
  lastActive: number;
}

export interface UserQuoteStatDaily {
  date: string;
  count: number;
  /** 截至该天的累计总数（窗口前存量 + 窗口内累计新增） */
  total?: number;
}

export interface UserQuoteStatsResp {
  total: number;
  users: UserQuoteStatItem[];
  daily: UserQuoteStatDaily[];
  days: number;
}

export interface UserQuoteListResp {
  total: number;
  page: number;
  pageSize: number;
  list: UserQuoteRow[];
}

// 列表：按用户 / 时间范围 / 关键词筛选
export function adminListUserQuotes(params: {
  openid?: string;
  startDay?: string;
  endDay?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserQuoteListResp> {
  return call<UserQuoteListResp>('list', params);
}

// 统计：每用户录入条数 + 全站总数 + 最近 N 天趋势
export function adminUserQuoteStats(days = 14): Promise<UserQuoteStatsResp> {
  return call<UserQuoteStatsResp>('stats', { days });
}

// 删除单条（admin）
export function adminRemoveUserQuote(id: string): Promise<{ removed: number }> {
  return call<{ removed: number }>('remove', { id });
}
