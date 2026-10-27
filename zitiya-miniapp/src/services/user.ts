// 小程序端用户服务：封装 user 云函数

import Taro from '@tarojs/taro';
import type { CloudFuncResp, UserProfile } from '@/types/user';

const FUNC = 'user';

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

/** 微信一键登录：按 OPENID upsert，新用户可传入昵称/头像 */
export function userLogin(profile?: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  return call<UserProfile>('login', profile as Record<string, unknown> | undefined);
}

/** 刷新当前登录用户档案 */
export function userMe(): Promise<UserProfile> {
  return call<UserProfile>('me');
}

/** 修改昵称 / 头像（只能改自己） */
export function userUpdateProfile(patch: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  return call<UserProfile>('updateProfile', patch);
}

/** 注销账号（真删） */
export function userDeleteAccount(): Promise<{ openid: string }> {
  return call<{ openid: string }>('deleteAccount');
}
