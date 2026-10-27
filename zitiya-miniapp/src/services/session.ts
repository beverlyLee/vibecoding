// 本地会话存储：只有 openid / nickname / avatar / role / status
// 不存敏感信息；启动时读它做快速恢复，再调 user.me 校验一次

import Taro from '@tarojs/taro';
import type { UserProfile } from '@/types/user';

const STORAGE_KEY = 'zuitiya_user_session';

interface SessionCache {
  openid: string;
  nickname: string;
  avatar: string;
  role: UserProfile['role'];
  status: UserProfile['status'];
}

export function loadSession(): SessionCache | null {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as SessionCache;
    if (!s.openid || !s.role || !s.status) return null;
    return s;
  } catch (e) {
    return null;
  }
}

export function saveSession(user: UserProfile): void {
  const data: SessionCache = {
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    role: user.role,
    status: user.status,
  };
  try {
    Taro.setStorageSync(STORAGE_KEY, data);
  } catch (e) {
    console.warn('[Session] 保存失败:', e);
  }
}

export function clearSession(): void {
  try {
    Taro.removeStorageSync(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}
