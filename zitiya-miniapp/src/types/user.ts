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
  member_expire: string | null;       // ISO 日期字符串，null = 非会员
  points: number;                      // 当前总余额（累积制）
  has_checked_today: boolean;          // 今日是否已签到
  daily_checkin_reward: number;         // 今日签到可获得的积分（会员翻倍后）
}

export type LoginStatus = 'guest' | 'authenticating' | 'authenticated';

// 云函数 user 的返回结构（与后端保持一致）
export interface CloudFuncResp<T> {
  code: number;
  message: string;
  data: T | null;
}
