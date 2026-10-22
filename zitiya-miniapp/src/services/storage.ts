// 本地存储封装：LLM 设置持久化

import Taro from '@tarojs/taro';
import { LLMSettings, DEFAULT_LLM_SETTINGS } from '@/types/settings';

const STORAGE_KEY = 'zuitiya_llm_settings';

export function loadLLMSettings(): LLMSettings {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY);
    if (raw && typeof raw === 'object' && raw.configs) {
      return {
        configs: raw.configs || {},
        activeKey: raw.activeKey || '',
        activeAsrKey: raw.activeAsrKey || ''
      };
    }
  } catch (err) {
    console.error('[Storage] 读取 LLM 设置失败:', err);
  }
  return { ...DEFAULT_LLM_SETTINGS };
}

export function saveLLMSettings(settings: LLMSettings): void {
  try {
    Taro.setStorageSync(STORAGE_KEY, settings);
    console.log('[Storage] LLM 设置已保存, activeKey =', settings.activeKey);
  } catch (err) {
    console.error('[Storage] 保存 LLM 设置失败:', err);
  }
}
