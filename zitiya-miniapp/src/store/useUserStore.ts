// 全局用户状态（Zustand）

import { create } from 'zustand';
import type { LoginStatus, UserProfile } from '@/types/user';

interface UserState {
  status: LoginStatus;
  user: UserProfile | null;

  // 启动时从本地恢复 + 云端校验
  init: () => Promise<void>;

  // 手动登录 / 登出
  login: (profile?: { nickname?: string; avatar?: string }) => Promise<UserProfile | null>;
  logout: () => void;

  // 修改档案
  updateProfile: (patch: { nickname?: string; avatar?: string }) => Promise<void>;

  // 注销账号
  deleteAccount: () => Promise<void>;

  // 门槛工具：未登录时弹窗并引导登录
  requireLogin: (actionLabel?: string) => boolean;

  // 便捷判断
  isLoggedIn: () => boolean;
  role: () => UserProfile['role'] | null;
}

export const useUserStore = create<UserState>((set, get) => ({
  status: 'guest',
  user: null,

  init: async () => {
    const { restoreSession } = await import('@/services/auth');
    await restoreSession();
  },

  login: async (profile) => {
    const { login } = await import('@/services/auth');
    try {
      return await login(profile);
    } catch {
      return null;
    }
  },

  logout: () => {
    const { logout } = require('@/services/auth');
    logout();
  },

  updateProfile: async (patch) => {
    const { updateProfile } = await import('@/services/auth');
    await updateProfile(patch);
  },

  deleteAccount: async () => {
    const { deleteAccount } = await import('@/services/auth');
    await deleteAccount();
  },

  requireLogin: (actionLabel) => {
    const { requireLogin } = require('@/services/auth');
    return requireLogin(actionLabel);
  },

  isLoggedIn: () => get().status === 'authenticated' && !!get().user,

  role: () => get().user?.role || null,
}));
