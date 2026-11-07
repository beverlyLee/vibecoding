// 全局模型配置服务：封装 admin_global_llm 云函数
// 多模型列表架构：管理后台可配置多个全局模型，每个独立启用/停用
// 消费者（llm_proxy / getGlobalLLMPublic）取第一个 enabled 的作为主用

import Taro from '@tarojs/taro';
import type { CloudFuncResp } from '@/types/user';
import type { GlobalLLMItem, GlobalLLMPublic } from '@/types/settings';
import { useAppStore } from '@/store/useAppStore';

const FUNC = 'admin_global_llm';

function call<T>(action: string, data?: Record<string, unknown>): Promise<T> {
  return Taro.cloud.callFunction({
    name: FUNC,
    data: { action, ...(data || {}) },
  }).then((res: any) => {
    const r = res.result as CloudFuncResp<T>;
    console.log(`[Cloud.${FUNC}.${action}] ←`, JSON.stringify(r).slice(0, 200));
    if (!r || typeof r.code !== 'number') {
      throw new Error(`云函数返回格式异常: ${JSON.stringify(res.result).slice(0, 200)}`);
    }
    if (r.code !== 0) {
      const e: any = new Error(r.message || '操作失败');
      e.code = r.code;
      throw e;
    }
    return r.data as T;
  }).catch((e: any) => {
    console.error(`[Cloud.${FUNC}.${action}] 调用失败`, e?.message, 'code=', e?.code);
    throw e;
  });
}

// 管理后台：读取全量 items（含 apiKey，供后台编辑回显），operator+ 可调用
export function adminListGlobalLLM(): Promise<GlobalLLMItem[]> {
  return call<GlobalLLMItem[]>('list');
}

// 管理后台：新增或更新一个条目（按 id upsert），admin 可调用
export function adminSaveGlobalLLMItem(item: Partial<GlobalLLMItem> & { name: string; protocol: string; baseURL: string; model: string }): Promise<{ id: string }> {
  return call<{ id: string }>('saveItem', { value: item }).then((res) => {
    useAppStore.getState().invalidateGlobalLLM();
    return res;
  });
}

// 管理后台：切换某个条目的 enabled，admin 可调用
export function adminToggleGlobalLLM(id: string): Promise<{ enabled: boolean }> {
  return call<{ enabled: boolean }>('toggle', { id }).then((res) => {
    useAppStore.getState().invalidateGlobalLLM();
    return res;
  });
}

// 管理后台：删除某个条目，admin 可调用
export function adminRemoveGlobalLLM(id: string): Promise<null> {
  return call<null>('remove', { id }).then((res) => {
    useAppStore.getState().invalidateGlobalLLM();
    return res;
  });
}

// 管理后台：实测指定条目或第一个 enabled 的连接是否可用，admin 可调用
export function adminTestGlobalLLM(id?: string): Promise<{ message: string }> {
  return call<{ message: string }>('test', id ? { id } : {});
}

// 管理后台：直接透传配置进行测试（编辑表单里填完草稿还没保存时用）
export function adminTestGlobalLLMWithConfig(config: {
  protocol: string; baseURL: string; apiKey: string; model: string;
}): Promise<{ message: string }> {
  return call<{ message: string }>('test', { config });
}

// 客户端：读取第一个 enabled 的公开字段（剥离 apiKey），任意登录用户可调用
export function getGlobalLLMPublic(): Promise<GlobalLLMPublic | null> {
  return call<GlobalLLMPublic | null>('getPublic');
}
