// 全局用户状态 —— 纯 globalThis + 手动 pub/sub
//
// ⚠️ 为什么不用 Zustand？
// Taro 代码分割后每个页面 bundle 独立 import 同一个 store 模块时，
// webpack 可能各自跑一次 create() → 多个独立 Zustand 实例，
// setState 互不可见，跨页面状态传递完全失效。
//
// globalThis 在同一 JS 运行时永远单例，不受 bundle 分割影响。
// 订阅用 Set 存回调，store 变化时批量通知，React hook 用 useState 订阅。

import { useState, useEffect } from 'react';
import type { LoginStatus, UserProfile } from '@/types/user';
import {
  restoreSession,
  loginCloud,
  clearAuthSession,
  updateProfileCloud,
  deleteAccountCloud,
  triggerLoginSheet,
  showBannedModal,
} from '@/services/auth';

// ================================================================
// 类型
// ================================================================
export interface AuthState {
  status: LoginStatus;
  user: UserProfile | null;
}

export interface AuthApi {
  init: () => Promise<void>;
  login: (profile?: { nickname?: string; avatar?: string }) => Promise<UserProfile | null>;
  logout: () => void;
  updateProfile: (patch: { nickname?: string; avatar?: string }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  requireLogin: (actionLabel?: string) => boolean;
  isLoggedIn: () => boolean;
  role: () => UserProfile['role'] | null;
}

// ================================================================
// globalThis 单例 —— 永远不会被重建
// ================================================================
const GT_KEY = '__ZUITIYA_AUTH_STORE_V2__';

interface GlobalStore {
  state: AuthState;
  listeners: Set<(state: AuthState) => void>;
  api: AuthApi;
}

function getGlobal(): GlobalStore {
  let g = (globalThis as any)[GT_KEY] as GlobalStore | undefined;
  if (g) return g;

  g = {
    state: { status: 'authenticating', user: null },
    listeners: new Set(),
    api: null as unknown as AuthApi,
  };

  const setState = (patch: Partial<AuthState>) => {
    const next: AuthState = { ...g.state, ...patch };
    g.state = next;
    console.log(`[Auth] ✍️ → ${next.status} ${next.user?.openid?.slice?.(0, 8) || 'null'} ${next.user?.role || ''}`);
    g.listeners.forEach((l) => {
      try { l(next); } catch (e) { console.warn('[Auth] listener error:', e); }
    });
  };

  g.api = {
    init: async () => {
      console.log('[Auth.init] ⏳ 开始恢复会话...');
      try {
        const cached = await restoreSession();
        if (cached) {
          console.log('[Auth.init] ✅ 恢复成功 openid=', cached.openid?.slice?.(0, 8), 'role=', cached.role);
          setState({ status: 'authenticated', user: cached });
        } else {
          console.log('[Auth.init] ⚠️ 无缓存，保持游客');
          setState({ status: 'guest', user: null });
        }
      } catch (e) {
        console.warn('[Auth] init 异常:', e);
        setState({ status: 'guest', user: null });
      }
    },

    login: async (profile) => {
      setState({ status: 'authenticating' });
      try {
        const user = await loginCloud(profile);
        setState({ status: 'authenticated', user });
        console.log('[Auth] ✅ 登录成功 openid=', user.openid?.slice?.(0, 8), 'role=', user.role);
        return user;
      } catch (e: any) {
        console.warn('[Auth] ❌ 登录失败:', e);
        setState({ status: 'guest', user: null });
        if (e?.code === 403) {
          showBannedModal(e?.openid || '');
        }
        return null;
      }
    },

    logout: () => {
      clearAuthSession();
      setState({ status: 'guest', user: null });
    },

    updateProfile: async (patch) => {
      const updated = await updateProfileCloud(patch);
      setState({ user: updated });
    },

    deleteAccount: async () => {
      await deleteAccountCloud();
      setState({ status: 'guest', user: null });
    },

    requireLogin: (actionLabel = '使用此功能') => {
      const { status, user } = g.state;
      const ok = status === 'authenticated' && !!user;
      console.log(`[Auth.requireLogin] "${actionLabel}" state=${status}/${user?.openid?.slice?.(0, 8) || 'null'} → ${ok ? '✅' : '❌ 弹层'}`);
      if (ok) return true;
      triggerLoginSheet(actionLabel);
      return false;
    },

    isLoggedIn: () => {
      const s = g.state;
      return s.status === 'authenticated' && !!s.user;
    },

    role: () => g.state.user?.role || null,
  };

  (globalThis as any)[GT_KEY] = g;
  return g;
}

// ================================================================
// 导出 1：静态 API 对象（非 React 场景 / 直接调用，永远是单例）
// ================================================================
export const authStore: AuthApi = {
  init: () => getGlobal().api.init(),
  login: (profile) => getGlobal().api.login(profile),
  logout: () => getGlobal().api.logout(),
  updateProfile: (patch) => getGlobal().api.updateProfile(patch),
  deleteAccount: () => getGlobal().api.deleteAccount(),
  requireLogin: (action) => getGlobal().api.requireLogin(action),
  isLoggedIn: () => getGlobal().api.isLoggedIn(),
  role: () => getGlobal().api.role(),
};

export const getAuthState = () => getGlobal().state;

// ================================================================
// 导出 2：订阅完整 state 的 hook（只需要状态，不需要 API 的场景）
// ================================================================
export function useAuthState() {
  const g = getGlobal();
  const [state, setState] = useState<AuthState>(() => g.state);

  useEffect(() => {
    const listener = (next: AuthState) => setState(next);
    g.listeners.add(listener);
    setState(getGlobal().state);
    return () => { g.listeners.delete(listener); };
  }, []);

  return state;
}

// ================================================================
// 导出 3：React Hook（组件用，自动订阅 + 重渲染 + API 方法）
//
//   const { status, user, login, logout, requireLogin } = useUserStore();
//
// ================================================================
export function useUserStore() {
  const g = getGlobal();
  const [state, setState] = useState<AuthState>(() => g.state);

  useEffect(() => {
    const listener = (next: AuthState) => setState(next);
    g.listeners.add(listener);
    // 立刻同步一次（init 可能已经跑完了）
    setState(getGlobal().state);
    return () => { g.listeners.delete(listener); };
  }, []);

  return {
    ...state,
    ...getGlobal().api,
  };
}
