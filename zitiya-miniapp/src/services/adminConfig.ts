// 管理后台场景配置服务：封装 admin_config 云函数
// 读写云端 scene_config.main，与 adminUsers.ts 同一套调用约定。

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';
import type {
  AttackScene,
  CloudSceneConfig,
  ConfigSection,
  IntentRule,
  LLMPreset,
  ModelParamsMap,
  PromptsMap,
  Quote,
} from '@/types/admin';

const FUNC = 'admin_config';

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

// ---------- 通用读写 ----------

export function adminGetConfig(): Promise<CloudSceneConfig> {
  return call<CloudSceneConfig>('getConfig');
}

export function adminSaveSection(section: ConfigSection, value: unknown): Promise<{ section: string; value: unknown }> {
  return call('saveSection', { section, value });
}

export function adminResetSection(section: ConfigSection): Promise<{ section: string }> {
  return call('resetSection', { section });
}

// ---------- 各区块便捷封装 ----------

export function adminSaveIntents(intents: IntentRule[]): Promise<unknown> {
  return adminSaveSection('intents', intents);
}

export function adminSaveQuotes(quotes: Quote[]): Promise<unknown> {
  return adminSaveSection('fixed_quotes', quotes);
}

export function adminSaveTopics(topics: string[]): Promise<unknown> {
  return adminSaveSection('crawl_topics', topics);
}

export function adminSaveDailyLimit(limit: number): Promise<unknown> {
  return adminSaveSection('daily_quote_limit', limit);
}

export function adminSaveDailyTTL(days: number): Promise<unknown> {
  return adminSaveSection('daily_quote_ttl_days', days);
}

export function adminSaveApiBase(apiBase: string): Promise<unknown> {
  return adminSaveSection('api_base', apiBase);
}

export function adminSavePrompts(prompts: PromptsMap): Promise<unknown> {
  return adminSaveSection('prompts', prompts);
}

export function adminSaveModelParams(map: ModelParamsMap): Promise<unknown> {
  return adminSaveSection('model_params', map);
}

export function adminSavePresets(presets: LLMPreset[]): Promise<unknown> {
  return adminSaveSection('presets', presets);
}

export function adminSaveAttackScenes(scenes: AttackScene[]): Promise<unknown> {
  return adminSaveSection('attack_scenes', scenes);
}

export function adminSaveAttackCategories(categories: string[]): Promise<unknown> {
  return adminSaveSection('attack_categories', categories);
}
