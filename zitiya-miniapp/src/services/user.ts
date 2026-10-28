// 小程序端用户服务：封装 user 云函数
// 全链路带 console.log，方便排查登录态问题

import Taro from '@tarojs/taro';
import type { CloudFuncResp, UserProfile } from '@/types/user';

const FUNC = 'user';

function call<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  const payload = { action, ...(data || {}) };
  console.log(`[Cloud.${FUNC}] → ${action}`, Object.keys(payload));
  return Taro.cloud.callFunction({
    name: FUNC,
    data: payload,
  }).then((res: any) => {
    const r = res.result as CloudFuncResp<T>;
    console.log(`[Cloud.${FUNC}] ← ${action} code=${r?.code} msg=${r?.message}`);
    if (!r || typeof r.code !== 'number') {
      throw new Error('云函数返回格式异常');
    }
    if (r.code !== 0) {
      const err: any = new Error(r.message || '操作失败');
      err.code = r.code;
      throw err;
    }
    return r.data as T;
  }).catch((e: any) => {
    console.error(`[Cloud.${FUNC}] ✘ ${action} 异常:`, e?.message || e);
    throw e;
  });
}

/** 微信一键登录：按 OPENID upsert */
export function userLogin(profile?: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  return call<UserProfile>('login', profile as Record<string, unknown> | undefined);
}

/** 刷新当前登录用户档案 */
export function userMe(): Promise<UserProfile> {
  return call<UserProfile>('me');
}

/** 修改昵称 / 头像 */
export function userUpdateProfile(patch: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  return call<UserProfile>('updateProfile', patch);
}

/** 注销账号（真删） */
export function userDeleteAccount(): Promise<{ openid: string }> {
  return call<{ openid: string }>('deleteAccount');
}
