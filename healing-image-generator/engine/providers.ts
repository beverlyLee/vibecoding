/* engine/providers.ts · AI 供应商档案表：声明式统一接入（spec 2026-09-02）。
 * 纯数据模块：零 DOM / 零依赖，可被 vite.config.ts 直接导入生成 dev 代理。 */

export interface ImageProfile {
  protocol: 'openai-multipart' | 'ark-json';
  size: string;                 // 生图请求 size 档位，如 '1024x1536' | '2K'
  supportsReference: boolean;   // 能否携带参考图
  extra?: Record<string, unknown>; // 追加请求字段，如 { watermark: false }
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;              // chat 与 images 请求的拼接基址（勿带尾部斜杠）
  chatModels: string[];         // 预设模型（UI datalist，可自由输入）
  imageModels: string[];        // 空数组 = 该供应商无生图能力（此时 image 省略）
  image?: ImageProfile;
  needsProxy: boolean;          // 浏览器直连是否被 CORS 拦截（dev 由 vite 代理转发）
  note?: string;                // 设置抽屉内展示的接入提示
  consoleLinks?: Array<{ label: string; url: string }>; // 控制台快捷入口（开通模型 / 管理 Key）
}

export const PROVIDERS: ProviderProfile[] = [
  {
    id: 'ark',
    name: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModels: ['doubao-seed-2-0-lite-260428', 'doubao-seed-1-8-251228'],
    imageModels: ['doubao-seedream-4-0-250828', 'doubao-seedream-3-0-t2i-250415'],
    image: {
      protocol: 'ark-json',
      size: '2K',
      supportsReference: true, // JSON /images/generations 的 image 字段（单图生图）
      extra: { response_format: 'b64_json', watermark: false },
    },
    needsProxy: true,
    note: '生图需开通 Seedream 系列；doubao-seed 文本模型不能生图。API Key 须为 ark- 开头（控制台「API Key 管理」创建），火山引擎 AccessKey 无效。',
    consoleLinks: [
      { label: '开通模型（先开通才能调用）', url: 'https://console.volcengine.com/ark/region:cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model' },
      { label: '创建 API Key', url: 'https://console.volcengine.com/ark/region:cn-beijing/apiKey' },
    ],
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    chatModels: ['hunyuan-turbos-latest', 'hunyuan-lite'],
    imageModels: [],
    needsProxy: false,
    note: 'API Key 填「{secret_id}:{secret_key}」格式；baseUrl 勿带尾部斜杠。生图走腾讯云专用签名 API，本工具暂不支持混元生图。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModels: ['gpt-4o-mini', 'gpt-4o'],
    imageModels: ['gpt-image-1'],
    image: {
      protocol: 'openai-multipart',
      size: '1024x1536', // 最接近 2:3 的官方档位
      supportsReference: true,
    },
    needsProxy: false,
    note: '需网络可达；有地区限制时可用「自定义」档案指向支持跨域的中转网关。',
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: '', // 用户在设置中填写
    chatModels: [],
    imageModels: [],
    image: {
      protocol: 'openai-multipart',
      size: '1024x1536',
      supportsReference: true,
    },
    needsProxy: false,
    note: '适配任意 OpenAI 兼容网关：填 baseUrl（如 https://your-gateway/v1），生图走 /images/edits（不支持时自动降级纯文生图）。',
  },
];

export function getProfile(providerId: string): ProviderProfile {
  return PROVIDERS.find(p => p.id === providerId) ?? PROVIDERS[PROVIDERS.length - 1]; // 未知 id 回退 custom
}

/* ── 配置模型 ─────────────────────────────────────────────── */

export interface ProviderCreds {
  apiKey: string;
  model: string;
  imageModel: string;
  baseUrl?: string; // 仅 custom 档案使用
}

export interface AiSettings {
  enabled: boolean;
  providerId: string;                        // 默认 'ark'
  creds: Record<string, ProviderCreds>;      // 按供应商独立保存，切回不用重填
}

export function emptyCreds(): ProviderCreds {
  return { apiKey: '', model: '', imageModel: '' };
}

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, providerId: 'ark', creds: {} };

/* ── 运行时解析 ──────────────────────────────────────────── */

export interface AiRuntime {
  profile: ProviderProfile;
  baseUrl: string;   // 已含代理前缀（needsProxy → /proxy-<id>）与尾部斜杠清理
  apiKey: string;
  model: string;
  imageModel: string;
}

/** 查表拍平：引擎各函数只接收 AiRuntime，不感知 store 结构 */
export function resolveRuntime(s: AiSettings): AiRuntime {
  const profile = getProfile(s.providerId);
  const creds = s.creds[profile.id] ?? emptyCreds();
  const rawBase = profile.id === 'custom' ? (creds.baseUrl ?? '') : profile.baseUrl;
  const base = rawBase.trim().replace(/\/+$/, '');
  // needsProxy：dev 由 vite 代理转发，请求路径 = /proxy-<id> + baseUrl 的 path 部分
  // （如 https://ark.cn-beijing.volces.com/api/v3 → /proxy-ark/api/v3，target 为 origin）
  const pathOnly = base.replace(/^https?:\/\/[^/]+/i, '') || '/';
  return {
    profile,
    baseUrl: profile.needsProxy ? `/proxy-${profile.id}${pathOnly}` : base,
    apiKey: creds.apiKey ?? '',
    model: creds.model ?? '',
    imageModel: creds.imageModel ?? '',
  };
}

const CHAT_SUFFIX = '/chat/completions';

/** chat endpoint：填 base 自动补全 /chat/completions（已带后缀则原样） */
export function chatEndpoint(rt: AiRuntime): string {
  const b = rt.baseUrl;
  return b.endsWith(CHAT_SUFFIX) ? b : b + CHAT_SUFFIX;
}

/** images endpoint */
export function imagesEndpoint(rt: AiRuntime, kind: 'generations' | 'edits'): string {
  return `${rt.baseUrl}/images/${kind}`;
}

/* ── 旧配置迁移 ──────────────────────────────────────────── */

/** 旧结构 {enabled, endpoint, apiKey, model, imageModel} → 新结构；新结构原样规范化 */
export function migrateLegacySettings(raw: unknown): AiSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_SETTINGS, creds: {} };
  const o = raw as Record<string, unknown>;
  // 已是新结构
  if (typeof o.providerId === 'string' && o.creds && typeof o.creds === 'object') {
    return {
      enabled: !!o.enabled,
      providerId: o.providerId,
      creds: o.creds as Record<string, ProviderCreds>,
    };
  }
  // 旧结构：按 endpoint 域名映射供应商
  const endpoint = typeof o.endpoint === 'string' ? o.endpoint : '';
  const isArk = /volces\.com|ark\./i.test(endpoint);
  const providerId = isArk ? 'ark' : 'custom';
  const creds: Record<string, ProviderCreds> = {
    [providerId]: {
      apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
      model: typeof o.model === 'string' ? o.model : '',
      imageModel: typeof o.imageModel === 'string' ? o.imageModel : '',
      ...(providerId === 'custom'
        ? { baseUrl: endpoint.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '') || undefined }
        : {}),
    },
  };
  return { enabled: !!o.enabled, providerId, creds };
}
