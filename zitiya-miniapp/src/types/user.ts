// 用户体系相关类型

export type UserRole = 'user' | 'operator' | 'admin';

export type UserStatus = 'active' | 'banned';

export interface UserProfile {
  _id: string;
  openid: string;
  nickname: string;
  avatar: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number | Date;
  lastLoginAt: number | Date;
  loginCount: number;
}

export type LoginStatus = 'guest' | 'authenticating' | 'authenticated';

// 云函数 user 的返回结构（与后端保持一致）
export interface CloudFuncResp<T> {
  code: number;
  message: string;
  data: T | null;
}
