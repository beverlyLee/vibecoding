// 管理后台前端服务：封装 admin_users 云函数

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';
import type { AdminListFilters, AdminStats, UserListResp } from '@/types/admin';

const FUNC = 'admin_users';

function call<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  return Taro.cloud.callFunction({
    name: FUNC,
    data: { action, ...(data || {}) },
  }).then((res: any) => {
    const r = res.result as CloudFuncResp<T>;
    if (!r || typeof r.code !== 'number') {
      throw new Error('云函数返回格式异常');
    }
    if (r.code !== 0) {
      const err: any = new Error(r.message || '操作失败');
      err.code = r.code;
      throw err;
    }
    return r.data as T;
  });
}

export function adminList(filters: AdminListFilters): Promise<UserListResp> {
  return call<UserListResp>('list', filters as Record<string, unknown>);
}

export function adminStats(): Promise<AdminStats> {
  return call<AdminStats>('stats');
}

export function adminSetStatus(openid: string, status: 'active' | 'banned'): Promise<{ openid: string; status: string }> {
  return call<{ openid: string; status: string }>('setStatus', { openid, status });
}

export function adminDelete(openid: string): Promise<{ openid: string }> {
  return call<{ openid: string }>('delete', { openid });
}

export function adminSetRole(openid: string, role: 'user' | 'operator' | 'admin'): Promise<{ openid: string; role: string }> {
  return call<{ openid: string; role: string }>('setRole', { openid, role });
}
