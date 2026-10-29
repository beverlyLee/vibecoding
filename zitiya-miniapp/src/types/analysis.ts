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
  // 命中的「我的语录」专属卡片：引擎独立检索用户语录库，多条命中时随机挑一条；未命中为 null/undefined（不展示卡片）
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
