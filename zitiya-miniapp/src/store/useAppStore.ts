// 全局状态：LLM 设置 + 语录回填

import { create } from 'zustand';
import type { GlobalLLMPublic, LLMConfig, LLMSettings } from '@/types/settings';
import { loadLLMSettings, saveLLMSettings } from '@/services/storage';
import { getLLMPresets } from '@/services/sceneConfig';
import { getGlobalLLMPublic } from '@/services/adminGlobalLLM';

interface AppState {
  // LLM 设置
  settings: LLMSettings;
  // 全局模型配置（管理后台统一配置，对所有用户生效）；null 表示未加载或未启用
  globalLLM: GlobalLLMPublic | null;
  // 语录页回填到拆招页的内容（null 表示无待回填）
  pendingQuote: string | null;
  // 加载本地存储
  init: () => void;
  // 拉取全局模型公开配置（带缓存），失败降级为 null
  initGlobalLLM: () => Promise<void>;
  // 让下次 initGlobalLLM 强制重拉（管理后台保存后调）
  invalidateGlobalLLM: () => void;
  // 保存单个厂商配置
  saveLLMConfig: (cfg: LLMConfig) => void;
  // 切换启用的语言处理模型（传空串表示仅用内置规则）
  setActiveLLM: (key: string) => void;
  // 切换启用的语音识别模型
  setActiveAsr: (key: string) => void;
  // 获取当前启用的配置；未启用返回 null（无用户配置时回退全局模型）
  getActiveLLM: () => LLMConfig | null;
  // 获取语音识别配置：优先显式启用的识别模型，否则找任意已配置且支持音频的厂商，再回退全局
  getAsrLLM: () => LLMConfig | null;
  // 语录回填
  setPendingQuote: (text: string) => void;
  clearPendingQuote: () => void;
}

// 全局模型配置加载状态（模块级缓存，避免重复拉取）
let _globalLLMLoaded = false;
let _globalLLMPromise: Promise<void> | null = null;

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
  globalLLM: null,
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
    const { settings, globalLLM } = get();
    // 1. 用户本地配置优先（但必须完整：apiKey 或 useGlobal 标记 + baseURL + model）
    if (settings.activeKey) {
      const cfg = settings.configs[settings.activeKey];
      if (cfg && cfg.baseURL && cfg.model && (cfg.apiKey || cfg.useGlobal)) return cfg;
    }
    // 2. 回退：管理后台全局模型（key 由云端托管，本地仅持有公开配置 + useGlobal 标记）
    if (globalLLM && globalLLM.enabled && globalLLM.baseURL && globalLLM.model) {
      return {
        key: 'global',
        name: globalLLM.name || '全局模型',
        protocol: globalLLM.protocol || 'openai',
        baseURL: globalLLM.baseURL,
        apiKey: '', // 实际 key 在云端，调用 llm_proxy 时走 useGlobal
        model: globalLLM.model,
        asrModel: globalLLM.asrModel,
        configured: true,
        useGlobal: true,
      };
    }
    return null;
  },

  getAsrLLM: () => {
    const { settings, globalLLM } = get();
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
    // 3. 全局模型兜底（若全局配置了 asrModel）
    if (globalLLM && globalLLM.enabled && globalLLM.asrModel) {
      return {
        key: 'global',
        name: globalLLM.name || '全局模型',
        protocol: globalLLM.protocol || 'openai',
        baseURL: globalLLM.baseURL,
        apiKey: '',
        model: globalLLM.model,
        asrModel: globalLLM.asrModel,
        configured: true,
        useGlobal: true,
      };
    }
    return null;
  },

  initGlobalLLM: () => {
    if (_globalLLMLoaded) return Promise.resolve();  // ← 已加载过就秒回（内存缓存）

    // 先同步读 Storage，有就立刻用（不阻塞 analyzeUtterance）
    const STORAGE_KEY = 'zuitiya_global_llm';
    let cached: GlobalLLMPublic | null = null;
    try {
      const raw = Taro.getStorageSync(STORAGE_KEY);
      if (raw && typeof raw === 'object') {
        cached = raw as GlobalLLMPublic;
        set({ globalLLM: cached });
        _globalLLMLoaded = true;
      }
    } catch { /* 忽略 */ }

    if (_globalLLMPromise) return _globalLLMPromise;
    _globalLLMPromise = (async () => {
      try {
        const pub = await getGlobalLLMPublic();
        set({ globalLLM: pub });
        // 持久化到 Storage
        try { Taro.setStorageSync(STORAGE_KEY, pub); } catch { /* 忽略 */ }
      } catch (e) {
        // 云端失败就保留 Storage 里的旧值（不强制清）
      } finally {
        _globalLLMLoaded = true;
        _globalLLMPromise = null;
      }
    })();

    return cached ? Promise.resolve() : _globalLLMPromise;
  },

  invalidateGlobalLLM: () => {
    _globalLLMLoaded = false;
    _globalLLMPromise = null;
    set({ globalLLM: null });
    try { Taro.removeStorageSync('zuitiya_global_llm'); } catch { /* 忽略 */ }
  },

  setPendingQuote: (text) => set({ pendingQuote: text }),
  clearPendingQuote: () => set({ pendingQuote: null })
}));;
