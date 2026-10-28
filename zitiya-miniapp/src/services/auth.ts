// 鉴权业务层：纯函数，只做「调云函数 + 读写 session 本地存储」
// 绝不 import useUserStore —— store 层负责 globalThis 状态写入，避免循环依赖。

import Taro from '@tarojs/taro';
import { userLogin, userMe, userUpdateProfile, userDeleteAccount } from './user';
import { loadSession, saveSession, clearSession } from './session';
import type { UserProfile } from '@/types/user';

/** 启动时恢复会话：读本地 session → 存在则调 user.me 校验 */
export async function restoreSession(): Promise<UserProfile | null> {
  const cached = loadSession();
  if (!cached) return null;

  try {
    const fresh = await userMe();
    if (fresh.status === 'banned') {
      clearSession();
      return null;
    }
    saveSession(fresh);
    return fresh;
  } catch (e: any) {
    console.warn('[Auth] restoreSession 云端校验失败（保留游客）:', e?.message || e);
    if (e?.code === 403 || e?.code === 404) {
      clearSession();
      return null;
    }
    // 网络波动：返回缓存让 UI 先挂上，下次 login 再刷新
    return {
      _id: '',
      openid: cached.openid,
      nickname: cached.nickname,
      avatar: cached.avatar,
      role: cached.role,
      status: cached.status,
      createdAt: 0,
      lastLoginAt: 0,
      loginCount: 0,
    };
  }
}

/** 微信一键登录（云函数 login）。内部会 throw 给调用方处理。 */
export async function loginCloud(profile?: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  const user = await userLogin(profile);
  if (user.status === 'banned') {
    clearSession();
    const err: any = new Error('账号已被封禁');
    err.code = 403;
    throw err;
  }
  saveSession(user);
  return user;
}

/** 清本地会话（登出用） */
export function clearAuthSession(): void {
  clearSession();
}

/** 修改昵称 / 头像（调云端 + 存本地 session） */
export async function updateProfileCloud(patch: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  const updated = await userUpdateProfile(patch);
  saveSession(updated);
  return updated;
}

/** 注销账号（调云端 + 清本地） */
export async function deleteAccountCloud(): Promise<void> {
  await userDeleteAccount();
  clearSession();
}

/** 封禁弹窗（由 store.login 调用） */
export function showBannedModal(openid: string) {
  Taro.showModal({
    title: '账号已被封禁',
    content: openid,
    showCancel: false,
  });
}

/** 全局登录弹层触发器（由 store.requireLogin 调用） */
export function triggerLoginSheet(actionLabel: string) {
  Taro.eventCenter.trigger('zuitiya:loginSheet', { reason: actionLabel });
}
