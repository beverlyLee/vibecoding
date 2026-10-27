// 鉴权业务入口：登录、登出、注销、requireLogin 门槛工具

import Taro from '@tarojs/taro';
import { userLogin, userMe, userUpdateProfile, userDeleteAccount } from './user';
import { loadSession, saveSession, clearSession } from './session';
import { useUserStore } from '@/store/useUserStore';
import type { UserProfile } from '@/types/user';

/**
 * 启动时恢复会话：读本地 session → 存在则调 user.me 校验
 * 校验失败（封禁 / 账号不存在 / 网络）→ 降级回游客，保留本地缓存给下次重试
 */
export async function restoreSession(): Promise<void> {
  const cached = loadSession();
  if (!cached) {
    useUserStore.setState({ status: 'guest', user: null });
    return;
  }

  // 先把缓存挂上，UI 不会闪
  useUserStore.setState({
    status: 'authenticated',
    user: {
      _id: '',
      openid: cached.openid,
      nickname: cached.nickname,
      avatar: cached.avatar,
      role: cached.role,
      status: cached.status,
      createdAt: 0,
      lastLoginAt: 0,
      loginCount: 0,
    },
  });

  try {
    const fresh = await userMe();
    if (fresh.status === 'banned') {
      // 封禁：清掉本地，让用户下次主动 login 时再给明确提示
      clearSession();
      useUserStore.setState({ status: 'guest', user: null });
      return;
    }
    saveSession(fresh);
    useUserStore.setState({ status: 'authenticated', user: fresh });
  } catch (e: any) {
    console.warn('[Auth] 校验会话失败（保留游客）:', e?.message || e);
    // 不强制登出，万一只是网络波动，下次 login 会刷新
    if (e?.code === 403 || e?.code === 404) {
      clearSession();
      useUserStore.setState({ status: 'guest', user: null });
    }
  }
}

/**
 * 微信一键登录（小程序 wx.login → 云函数 login）
 * 如果已登录则刷新会话
 * @param profile 可选的昵称和头像，登录时直接写入
 */
export async function login(profile?: { nickname?: string; avatar?: string }): Promise<UserProfile> {
  useUserStore.setState({ status: 'authenticating' });
  try {
    const user = await userLogin(profile);
    if (user.status === 'banned') {
      clearSession();
      useUserStore.setState({ status: 'guest', user: null });
      Taro.showModal({
        title: '账号已被封禁',
        content: user.openid, // 给个 openid 方便用户申诉
        showCancel: false,
      });
      const err: any = new Error('账号已被封禁');
      err.code = 403;
      throw err;
    }
    saveSession(user);
    useUserStore.setState({ status: 'authenticated', user });
    return user;
  } catch (e) {
    useUserStore.setState({ status: 'guest', user: null });
    throw e;
  }
}

/** 登出：清会话 + 内存态 */
export function logout(): void {
  clearSession();
  useUserStore.setState({ status: 'guest', user: null });
  Taro.showToast({ title: '已退出登录', icon: 'none', duration: 1200 });
}

/**
 * 注销账号（真删）：调云端 + 清本地
 * 禁止 admin 自删（云函数会拦）
 */
export async function deleteAccount(): Promise<void> {
  const user = useUserStore.getState().user;
  if (user?.role === 'admin') {
    Taro.showToast({ title: '管理员不能注销自己', icon: 'none' });
    return;
  }
  const res = await Taro.showModal({
    title: '确认注销账号',
    content: '注销后数据将永久删除，无法恢复。确定吗？',
    confirmText: '注销',
    confirmColor: '#D9534F',
  });
  if (!res.confirm) return;

  await userDeleteAccount();
  clearSession();
  useUserStore.setState({ status: 'guest', user: null });
  Taro.showToast({ title: '已注销', icon: 'success' });
}

/** 修改昵称 / 头像 */
export async function updateProfile(patch: { nickname?: string; avatar?: string }): Promise<void> {
  const updated = await userUpdateProfile(patch);
  saveSession(updated);
  useUserStore.setState({ user: updated });
}

/**
 * 功能门槛工具：未登录时触发全局登录弹层事件，不执行后续操作
 * 返回 true 表示已登录、可继续；false 表示被拦截
 */
export function requireLogin(actionLabel = '使用此功能'): boolean {
  const state = useUserStore.getState();
  if (state.status === 'authenticated' && state.user) return true;

  // 通过 Taro eventCenter 触发底部登录弹层
  // 订阅方（profile / defend 页等）收到后弹出 LoginSheet
  Taro.eventCenter.trigger('zuitiya:loginSheet', { reason: actionLabel });
  return false;
}
