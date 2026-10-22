// 全局状态：LLM 设置 + 语录回填

import { create } from 'zustand';
import type { LLMConfig, LLMSettings } from '@/types/settings';
import { loadLLMSettings, saveLLMSettings } from '@/services/storage';
import { getLLMPresets } from '@/services/sceneConfig';

interface AppState {
  // LLM 设置
  settings: LLMSettings;
  // 语录页回填到拆招页的内容（null 表示无待回填）
  pendingQuote: string | null;
  // 加载本地存储
  init: () => void;
  // 保存单个厂商配置
  saveLLMConfig: (cfg: LLMConfig) => void;
  // 切换启用的语言处理模型（传空串表示仅用内置规则）
  setActiveLLM: (key: string) => void;
  // 切换启用的语音识别模型
  setActiveAsr: (key: string) => void;
  // 获取当前启用的配置；未启用返回 null
  getActiveLLM: () => LLMConfig | null;
  // 获取语音识别配置：优先显式启用的识别模型，否则找任意已配置且支持音频的厂商
  getAsrLLM: () => LLMConfig | null;
  // 语录回填
  setPendingQuote: (text: string) => void;
  clearPendingQuote: () => void;
}

function toConfig(key: string, existing?: LLMConfig): LLMConfig {
  const preset = getLLMPresets().find((p) => p.key === key);
  return {
    key,
    name: existing?.name || preset?.name || key,
    protocol: existing?.protocol || preset?.protocol || 'openai',
    baseURL: existing?.baseURL ?? preset?.baseURL ?? '',
    apiKey: existing?.apiKey || '',
    model: existing?.model ?? preset?.model ?? '',
    asrModel: existing?.asrModel ?? preset?.asrModel,
    configured: existing?.configured || false
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: { configs: {}, activeKey: '' },
  pendingQuote: null,

  init: () => {
    const loaded = loadLLMSettings();
    // 补全预设（保证所有厂商卡片都出现，含后台新增/覆盖的厂商）
    const configs: Record<string, LLMConfig> = {};
    for (const preset of getLLMPresets()) {
      configs[preset.key] = toConfig(preset.key, loaded.configs[preset.key]);
    }
    const activeKey = loaded.activeKey && (configs[loaded.activeKey]?.apiKey ? loaded.activeKey : '');
    const activeAsrKey = loaded.activeAsrKey && (configs[loaded.activeAsrKey]?.apiKey ? loaded.activeAsrKey : '');
    set({ settings: { configs, activeKey, activeAsrKey } });
    console.log('[Store] 设置已加载, activeKey =', activeKey, ', activeAsrKey =', activeAsrKey);
  },

  saveLLMConfig: (cfg) => {
    const { settings } = get();
    const nextConfigs = { ...settings.configs, [cfg.key]: { ...cfg, configured: Boolean(cfg.apiKey) } };
    const next: LLMSettings = { ...settings, configs: nextConfigs };
    saveLLMSettings(next);
    set({ settings: next });
  },

  setActiveLLM: (key) => {
    const { settings } = get();
    if (key && !settings.configs[key]?.apiKey) {
      console.error('[Store] 该厂商未配置 API Key，无法启用:', key);
      return;
    }
    const next: LLMSettings = { ...settings, activeKey: key };
    saveLLMSettings(next);
    set({ settings: next });
  },

  setActiveAsr: (key) => {
    const { settings } = get();
    if (key && !settings.configs[key]?.apiKey) {
      console.error('[Store] 该厂商未配置 API Key，无法启用语音识别:', key);
      return;
    }
    const next: LLMSettings = { ...settings, activeAsrKey: key };
    saveLLMSettings(next);
    set({ settings: next });
  },

  getActiveLLM: () => {
    const { settings } = get();
    if (!settings.activeKey) return null;
    const cfg = settings.configs[settings.activeKey];
    return cfg && cfg.apiKey ? cfg : null;
  },

  getAsrLLM: () => {
    const { settings } = get();
    // 1. 显式启用的语音识别模型优先
    if (settings.activeAsrKey) {
      const explicit = settings.configs[settings.activeAsrKey];
      if (explicit && explicit.apiKey) return explicit;
    }
    // 2. 兜底：任意已配置且支持音频接口的厂商
    const isAsrCapable = (cfg: LLMConfig): boolean =>
      Boolean(cfg.apiKey) &&
      (Boolean(cfg.asrModel) || /siliconflow|groq|api\.openai\.com/i.test(cfg.baseURL));
    const active = get().getActiveLLM();
    if (active && isAsrCapable(active)) return active;
    for (const cfg of Object.values(settings.configs)) {
      if (isAsrCapable(cfg)) return cfg;
    }
    return null;
  },

  setPendingQuote: (text) => set({ pendingQuote: text }),
  clearPendingQuote: () => set({ pendingQuote: null })
}));
