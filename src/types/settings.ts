// 大模型配置相关类型

// 协议类型：openai 兼容 / anthropic
export type LLMProtocol = 'openai' | 'anthropic';

// 单个厂商的 LLM 配置
export interface LLMConfig {
  // 配置标识（预设 key 或自定义 key）
  key: string;
  // 展示名称
  name: string;
  // 协议类型
  protocol: LLMProtocol;
  // API 地址，如 https://api.deepseek.com/v1
  baseURL: string;
  // API Key（仅保存在本地）
  apiKey: string;
  // 模型名，如 deepseek-chat
  model: string;
  // 语音识别（ASR）模型名，用于 Whisper 兼容接口；空则用厂商默认
  asrModel?: string;
  // 是否已保存过 key
  configured: boolean;
}

// 厂商预设（不含敏感信息）
export interface LLMPreset {
  key: string;
  name: string;
  protocol: LLMProtocol;
  baseURL: string;
  model: string;
  // 语音识别模型（支持音频转写的厂商）
  asrModel?: string;
  // 获取 API Key 的地址
  keyUrl: string;
  note: string;
}

export const LLM_PRESETS: LLMPreset[] = [
  {
    key: 'volcengine',
    name: '火山引擎（豆包）',
    protocol: 'openai',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k',
    keyUrl: 'console.volcengine.com/ark',
    note: '火山方舟，国内直连；模型名填接入点 ID（ep-开头）或模型名'
  },
  {
    key: 'siliconflow',
    name: '硅基流动',
    protocol: 'openai',
    baseURL: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    asrModel: 'FunAudioLLM/SenseVoiceSmall',
    keyUrl: 'cloud.siliconflow.cn',
    note: '国内直连，含免费语音识别模型，语音兜底推荐'
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'platform.deepseek.com',
    note: '性价比高，国内直连'
  },
  {
    key: 'zhipu',
    name: '智谱 GLM',
    protocol: 'openai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    keyUrl: 'open.bigmodel.cn',
    note: 'glm-4-flash 免费额度大，推荐入门'
  },
  {
    key: 'qwen',
    name: '通义千问',
    protocol: 'openai',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-turbo',
    keyUrl: 'bailian.console.aliyun.com',
    note: '阿里云百炼平台'
  },
  {
    key: 'moonshot',
    name: 'Kimi',
    protocol: 'openai',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyUrl: 'platform.moonshot.cn',
    note: '长文本理解好'
  },
  {
    key: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    asrModel: 'whisper-1',
    keyUrl: 'platform.openai.com',
    note: '需国际网络环境'
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
    keyUrl: 'console.anthropic.com',
    note: 'Claude 系列，需国际网络环境'
  },
  {
    key: 'custom',
    name: '自定义（OpenAI 兼容）',
    protocol: 'openai',
    baseURL: '',
    model: '',
    keyUrl: '',
    note: '任意 OpenAI 兼容接口（如 Ollama、OneAPI、硅基流动等）'
  }
];

// 存储结构
export interface LLMSettings {
  // 各厂商配置
  configs: Record<string, LLMConfig>;
  // 语言处理模型（意图识别 + 话术生成）启用 key，空字符串表示使用内置规则引擎
  activeKey: string;
  // 语音识别模型（录音转文字）启用 key，空字符串表示自动选择支持音频的已配置厂商
  activeAsrKey: string;
}

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  configs: {},
  activeKey: '',
  activeAsrKey: ''
};

// 支持语音识别（Whisper 兼容音频接口）的预设：显式带 asrModel，或允许自定义接口
export const ASR_PRESETS: LLMPreset[] = LLM_PRESETS.filter(
  (p) => Boolean(p.asrModel) || p.key === 'custom'
);
