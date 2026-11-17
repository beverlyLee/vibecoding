// 分析相关类型定义

import type { Quote } from '@/data/quotes';

// 回应风格
export type ResponseStyle = 'gentle' | 'humor' | 'direct' | 'counter';

// 意图强度
export type IntensityLevel = 'low' | 'medium' | 'high';

// 分析结果中的单条回话
export interface Response {
  id: string;
  style: ResponseStyle;
  text: string;
  reason: string;
  // 一句话口诀锚点（如「先接后拒，留台阶」）；由 AI 生成，旧数据可能缺失，缺省不展示
  reasonShort?: string;
  // 规则引擎模式下提供的换说法备选
  variants?: string[];
}

// 单次分析结果
export interface AnalysisResult {
  id: string;
  // 被分析的原话
  utterance: string;
  // 命中的意图标签（按得分排序，可多个）
  intent: string[];
  intensity: IntensityLevel;
  situation: string;
  // 结果来源：rule 规则模板秒回 / llm 大模型返回 / fallback LLM调失败降级 / fallback_no_llm 规则无命中且未配置 LLM
  source: 'rule' | 'llm' | 'fallback' | 'fallback_no_llm';
  responses: Response[];
  // 命中的「我的语录」专属卡片：引擎独立检索用户语录库，多条命中时按得分排序全部返回；未命中为空数组
  userQuotes?: Quote[];
  // @deprecated 兼容旧逻辑，单条版本（取 userQuotes[0]）
  userQuote?: Quote | null;
  // 分析耗时（毫秒）
  costMs: number;
}

// 风格元信息（展示用）
export interface StyleMeta {
  key: ResponseStyle;
  name: string;
  desc: string;
  color: string;
  bg: string;
}

export const STYLE_META: StyleMeta[] = [
  { key: 'gentle', name: '温和化解', desc: '四两拨千斤，不撕破脸', color: '#00B42A', bg: '#E8FFEA' },
  { key: 'humor', name: '幽默带过', desc: '轻松岔开，气氛不僵', color: '#FF7D00', bg: '#FFF3E8' },
  { key: 'direct', name: '直接拒绝', desc: '表明立场，不卑不亢', color: '#F53F3F', bg: '#FFECE8' },
  { key: 'counter', name: '反将一军', desc: '礼貌把问题抛回去', color: '#722ED1', bg: '#F5E8FF' }
];

export function getStyleMeta(style: ResponseStyle): StyleMeta {
  return STYLE_META.find((s) => s.key === style) || STYLE_META[0];
}

// 强度展示文案
export const INTENSITY_META: Record<IntensityLevel, { label: string; color: string }> = {
  low: { label: '无恶意', color: '#00B42A' },
  medium: { label: '让人不适', color: '#FF7D00' },
  high: { label: '明显施压', color: '#F53F3F' }
};

// 风格对应的大号 emoji 头像（锦囊卡视觉锚点）
export const STYLE_EMOJI: Record<ResponseStyle, string> = {
  gentle: '🕊️',
  humor: '😏',
  direct: '🛡️',
  counter: '🎯'
};

// 风格内置口诀（既无 AI 口诀、又无 reason 时的兜底，保证锦囊卡永远有一句短结论）
const STYLE_MOTTO: Record<ResponseStyle, string> = {
  gentle: '先接住，再轻轻化开',
  humor: '笑着把话接过去',
  direct: '温和，但把边界说清',
  counter: '把问题轻轻递回去'
};

/**
 * 口诀锚点：不依赖 AI 新增字段，直接从现有文本提炼一句短结论。
 * 优先级：reasonShort（AI 已生成）→ reason 首句（截断 18 字）→ 风格内置口诀。
 * 保证 llm / rule / fallback 任何来源都有一句可见口诀，改版效果立即可见。
 */
export function deriveMotto(r: Response): string {
  if (r.reasonShort && r.reasonShort.trim()) return r.reasonShort.trim();
  const reason = (r.reason || '').trim();
  if (reason) {
    const first = reason.split(/[。！？!?；;\n]/)[0].trim().replace(/[，,、：:]$/, '');
    if (first) return first.length > 18 ? `${first.slice(0, 18)}…` : first;
  }
  return STYLE_MOTTO[r.style] || '照着说就行';
}
