// 管理后台类型（前端视角）

import type { UserRole, UserStatus } from './user';
import type { IntentRule } from '@/data/intents';
import type { Quote } from '@/data/quotes';
import type { AttackScene } from '@/data/attackScenes';
import type { LLMPreset } from '@/types/settings';

// 重新导出实体类型，供 adminConfig / ConfigSections 统一从 @/types/admin 引入
export type { IntentRule } from '@/data/intents';
export type { Quote } from '@/data/quotes';
export type { AttackScene } from '@/data/attackScenes';
export type { LLMPreset } from '@/types/settings';

// 列表项：operator 看不到 role 列，admin 看得到
export interface UserListItem {
  openid: string;
  nickname: string;
  avatar: string;
  status: UserStatus;
  role?: UserRole;   // 仅 admin 返回
  createdAt: number | Date;
  lastLoginAt: number | Date;
  loginCount: number;
}

export interface UserListResp {
  total: number;
  page: number;
  pageSize: number;
  items: UserListItem[];
}

export interface AdminStats {
  total: number;
  active: number;
  banned: number;
  todayNew: number;
  byRole: { admin: number; operator: number; user: number };
}

export type AdminListFilters = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: '' | 'active' | 'banned';
  role?: '' | UserRole;   // 仅 admin 有意义
};

// ================================================================
// 场景配置（云端 scene_config.main）类型
// ================================================================

/** 单个用途档位的模型参数 */
export interface ModelParamValue {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/** 模型参数按用途档位覆盖（default / analyze / quoteGen / rephrase / test） */
export type ModelParamsMap = Record<string, ModelParamValue>;

/** LLM system prompt 覆盖（key 见 DEFAULT_PROMPTS） */
export type PromptsMap = Record<string, string>;

/** 云端 scene_config.main 文档的业务字段（不含 _id 等内部字段） */
export interface CloudSceneConfig {
  intents?: IntentRule[];
  fixed_quotes?: Quote[];
  crawl_topics?: string[];
  daily_quote_limit?: number;
  daily_quote_ttl_days?: number;
  api_base?: string;
  prompts?: PromptsMap;
  model_params?: ModelParamsMap;
  presets?: LLMPreset[];
  attack_scenes?: AttackScene[];
  attack_categories?: string[];
}

/** 可写入的区块名（与云函数白名单一致） */
export type ConfigSection =
  | 'intents'
  | 'fixed_quotes'
  | 'crawl_topics'
  | 'daily_quote_limit'
  | 'daily_quote_ttl_days'
  | 'api_base'
  | 'prompts'
  | 'model_params'
  | 'presets'
  | 'attack_scenes'
  | 'attack_categories';
