// 全局模型配置服务：封装 admin_global_llm 云函数
// - adminGetGlobalLLM  / adminSaveGlobalLLM：管理后台读写全量配置（含 apiKey，admin 写、operator 读）
// - getGlobalLLMPublic：任意登录用户读取公开字段（剥离 apiKey），供引擎判断是否启用全局模型
// - adminTestGlobalLLM：后台实测全局配置是否可用（走 llm_proxy 的 useGlobal 链路）

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';
import type { GlobalLLMConfig, GlobalLLMPublic } from '@/types/settings';

const FUNC = 'admin_global_llm';

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
      const e: any = new Error(r.message || '操作失败');
      e.code = r.code;
      throw e;
    }
    return r.data as T;
  });
}

// 管理后台：读取全量配置（含 apiKey），operator+ 可调用
export function adminGetGlobalLLM(): Promise<GlobalLLMConfig | null> {
  return call<GlobalLLMConfig | null>('get');
}

// 管理后台：保存全量配置（admin）
export function adminSaveGlobalLLM(value: GlobalLLMConfig): Promise<GlobalLLMConfig> {
  return call<GlobalLLMConfig>('set', { value });
}

// 管理后台：实测全局配置是否可用
export function adminTestGlobalLLM(): Promise<{ message: string }> {
  return call<{ message: string }>('test');
}

// 客户端：读取公开字段（剥离 apiKey），任意登录用户可调用
export function getGlobalLLMPublic(): Promise<GlobalLLMPublic | null> {
  return call<GlobalLLMPublic | null>('getPublic');
}
