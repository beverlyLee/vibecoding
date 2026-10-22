// 分析引擎：LLM 优先（意图识别 + 话术生成），未配置或失败自动降级本地关键词规则

import Taro from '@tarojs/taro';
import type { AnalysisResult, Response, ResponseStyle } from '@/types/analysis';
import { GENERIC_INTENT_KEY } from '@/data/intents';
import type { IntentRule } from '@/data/intents';
import { chatCompletion, extractJSON } from '@/services/llm';
import { useAppStore } from '@/store/useAppStore';
import { funnelForEngine } from '@/services/quoteFunnel';
import { getKeywordsFor, getAllIntentRules, getPrompt, getModelParams } from '@/services/sceneConfig';
import { filterResponses } from '@/services/contentFilter';
import { matchInDailyPool, hasDailyPool } from '@/services/dailyIntentPool';

const VALID_STYLES: ResponseStyle[] = ['gentle', 'humor', 'direct', 'counter'];

// ============ LLM 交互 ============

interface LLMAnalysisPayload {
  intents?: string[];
  intent?: string; // 兼容旧格式
  intensity?: string;
  situation?: string;
  responses?: { style?: string; text?: string; reason?: string }[];
}

// LLM 分析：意图识别 + 话术生成一次完成
async function llmAnalyze(utterance: string): Promise<Omit<AnalysisResult, 'id' | 'costMs' | 'utterance'>> {
  const cfg = useAppStore.getState().getActiveLLM();
  if (!cfg) throw new Error('未配置可用的大模型');

  const startTime = Date.now();
  const raw = await chatCompletion(
    cfg,
    [
      { role: 'system', content: getPrompt('analyze') },
      { role: 'user', content: `别人对我说的话：「${utterance}」` }
    ],
    { tag: '拆招分析', ...getModelParams('analyze') }
  );
  console.log('[Engine] LLM 原始返回耗时', Date.now() - startTime, 'ms');

  const payload = extractJSON<LLMAnalysisPayload>(raw);
  if (!payload || !payload.responses || !Array.isArray(payload.responses) || payload.responses.length === 0) {
    console.error('[Engine] LLM 返回内容无法解析为有效结果:', raw.slice(0, 300));
    throw new Error('LLM 返回解析失败');
  }

  const responses: Response[] = payload.responses
    .filter((r) => r && r.text && VALID_STYLES.includes(r.style as ResponseStyle))
    .map((r, i) => ({
      id: `${Date.now()}_llm_${i}`,
      style: r.style as ResponseStyle,
      text: String(r.text).trim(),
      reason: String(r.reason || '').trim()
    }));
  if (responses.length === 0) throw new Error('LLM 未返回有效回话');

  const intentList = (payload.intents && Array.isArray(payload.intents) && payload.intents.length > 0)
    ? payload.intents.slice(0, 5).map((s) => String(s).trim()).filter(Boolean)
    : [String(payload.intent || '未识别').slice(0, 20)];

  console.log(`[Engine] LLM 分析结果: 意图 ${JSON.stringify(intentList)} 强度 ${payload.intensity}，有效回话 ${responses.length} 条`);

  return {
    intent: intentList,
    intensity: (['low', 'medium', 'high'].includes(payload.intensity || '') ? payload.intensity : 'medium') as AnalysisResult['intensity'],
    situation: String(payload.situation || '').slice(0, 100),
    source: 'llm',
    responses
  };
}

// ============ 本地规则引擎 ============

// 单个关键词集在输入文本里的命中数
function countHits(text: string, keywords: string[]): number {
  if (!keywords?.length) return 0;
  let hits = 0;
  for (const kw of keywords) {
    if (kw && text.includes(kw)) hits += 1;
  }
  return hits;
}

// 通用评分候选（跨层复用）
interface IntentCandidate {
  name: string;
  intentKey: string;
  score: number;
  hits: number;
}

/**
 * 通用评分：给任意 IntentCandidate[] 填 score + hits 并按 score 降序排
 * score = weight × 关键词命中数
 * 同一层内的候选一起比谁分高；跨层用漏斗递进决定去哪一层
 */
function rankCandidates(
  text: string,
  items: { name: string; intentKey: string; keywords: string[]; weight: number }[]
): IntentCandidate[] {
  const ranked: IntentCandidate[] = [];
  for (const item of items) {
    const hits = countHits(text, item.keywords);
    if (hits > 0) {
      ranked.push({
        name: item.name,
        intentKey: item.intentKey,
        score: item.weight * hits,
        hits,
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score || b.hits - a.hits);
  return ranked;
}

// ============ L1 固定规则层 ============

function rankFixedIntents(text: string): IntentCandidate[] {
  const rules = getAllIntentRules().filter((r) => r.key !== GENERIC_INTENT_KEY);
  return rankCandidates(
    text,
    rules.map((r) => ({
      name: r.name,
      intentKey: r.key,
      keywords: getKeywordsFor(r.key),
      weight: r.weight,
    }))
  );
}

function pickPrimaryRuleFromFixed(ranked: IntentCandidate[]): IntentRule {
  if (ranked.length > 0) {
    const key = ranked[0].intentKey;
    const rule = getAllIntentRules().find((r) => r.key === key);
    if (rule) return rule;
  }
  return getAllIntentRules().find((r) => r.key === GENERIC_INTENT_KEY)!;
}

// 规则引擎分析：零网络依赖，即时返回（rule 由调用方先匹配好传入）
function ruleAnalyze(
  utterance: string,
  rule: IntentRule,
  allIntentNames: string[]
): Omit<AnalysisResult, 'id' | 'costMs' | 'utterance'> {
  console.log('[Engine] 采用规则结果:', rule.key, rule.name, allIntentNames.length > 1 ? `（共命中 ${allIntentNames.length} 个）` : '');
  const now = Date.now();
  const responses: Response[] = rule.responses.map((r, i) => ({
    ...r,
    id: `${now}_rule_${i}`
  }));
  return {
    intent: allIntentNames.length > 0 ? allIntentNames : [rule.name],
    intensity: rule.intensity,
    situation: rule.situation,
    source: 'rule',
    responses
  };
}

// ============ 统一入口 ============

// 拆招分析：意图判定走三层漏斗（L1 固定规则 → L2 每日热词 → L3 LLM），
// 每一层无命中/没配置/失败则下钻下一层
export async function analyzeUtterance(utterance: string): Promise<AnalysisResult> {
  console.log('[API] engine.analyzeUtterance ← 入口, 输入', utterance.trim().length, '字');
  const text = utterance.trim();
  if (!text) throw new Error('输入为空');
  const startTime = Date.now();

  const cfg = useAppStore.getState().getActiveLLM();

  // ========== 意图判定：严格漏斗递进（L1 零命中才进 L2，L2 零命中才进 L3）==========
  // 评分只在同一层内部排序用
  const fixedRanked = rankFixedIntents(text);
  const hasFixedHit = fixedRanked.length > 0;
  const fixedRule = hasFixedHit
    ? pickPrimaryRuleFromFixed(fixedRanked)
    : getAllIntentRules().find((r) => r.key === GENERIC_INTENT_KEY)!;

  const dailyMatches = hasDailyPool() ? matchInDailyPool(text) : null;
  const hasDailyHit = !!dailyMatches && dailyMatches.matchedQuotes.length > 0;

  // 决策日志
  if (hasFixedHit) {
    const desc = fixedRanked.slice(0, 5).map((r) => `${r.name}(score=${r.score},hits=${r.hits})`).join(' / ');
    console.log(`[Engine] L1 固定规则命中: ${desc}`);
  } else if (hasDailyHit) {
    console.log(`[Engine] L1 无命中, L2 daily 命中 ${dailyMatches!.matchedQuotes.length} 条, intent_keys=[${dailyMatches!.hitIntentKeys.join(',')}]`);
  } else {
    console.log('[Engine] L1+L2 均无命中 → 走 L3 LLM 或兜底');
  }

  // ========== 语录金句漏斗（固定库 → 每日库，仅拉两层，不走 LLM）==========
  const funnelHit = await funnelForEngine(text, fixedRule.key);
  let funnelQuotes: string[] = [];
  let funnelSourceTag = '';
  if (funnelHit?.quotes?.length) {
    funnelQuotes = funnelHit.quotes.map((q) => q.content);
    funnelSourceTag = funnelHit.hitLayer === 'fixed' ? '📚 固定语录' : '🔥 社区热话';
    console.log(`[Engine] 语录漏斗命中 (${funnelHit.hitLayer}): ${funnelQuotes.length} 条推荐金句`);
  } else {
    console.log('[Engine] 语录漏斗无命中');
  }

  // ========== 核心回话生成 ==========
  let baseResult: Omit<AnalysisResult, 'id' | 'costMs' | 'utterance'>;
  let source: AnalysisResult['source'];

  if (hasFixedHit) {
    // === L1 命中 → 秒回用最高分的规则模板，不碰 L2/L3/LLM ===
    const allRuleIntentNames = fixedRanked.map((r) => r.name);
    console.log('[Engine] L1 命中 → 用「' + fixedRule.name + '」模板回话');
    baseResult = ruleAnalyze(text, fixedRule, allRuleIntentNames);
    source = 'rule';
  } else if (hasDailyHit) {
    // === L1 零命中 + L2 daily 命中 → 用 daily ===
    // L2 层也不调 LLM，有 content 就追加当金句，没有就用 daily 的 intent_key 映射 generic 模板
    const l2IntentNames: string[] = [];
    for (const k of dailyMatches!.hitIntentKeys) {
      const mapped = getAllIntentRules().find((r) => r.key === k);
      if (mapped && !l2IntentNames.includes(mapped.name)) l2IntentNames.push(mapped.name);
    }
    if (l2IntentNames.length === 0) l2IntentNames.push('社区热语');

    const dailyContents = dailyMatches!.matchedQuotes
      .map((q) => q.content?.trim() || '')
      .filter((c) => c.length >= 6);

    if (dailyContents.length > 0) {
      // daily 自带可用金句，追加到回话末尾
      console.log('[Engine] L2 daily 命中 + 有 content → generic 模板 + daily 金句');
      baseResult = ruleAnalyze(text, fixedRule, l2IntentNames);
      source = 'rule';
      funnelQuotes = dailyContents.slice(0, 2);
      funnelSourceTag = '🔥 社区热话';
    } else {
      // daily 命中但内容空洞，还是 generic 模板，不调 LLM
      console.log('[Engine] L2 daily 命中但 content 空洞 → generic 模板');
      baseResult = ruleAnalyze(text, fixedRule, l2IntentNames);
      source = 'rule';
    }
  } else if (cfg) {
    // === L1+L2 均零命中 + 配了 LLM → L3 调 LLM（这是唯一调 LLM 的地方）===
    console.log('[Engine] L1+L2 均无命中 + 有 LLM → L3 调大模型');
    try {
      baseResult = await llmAnalyze(text);
      if (!baseResult.intent || baseResult.intent.length === 0) {
        baseResult.intent = ['未识别场景'];
      }
      source = 'llm';
    } catch (err) {
      console.error('[Engine] L3 LLM 失败, 降级万能兜底:', err instanceof Error ? err.message : err);
      baseResult = ruleAnalyze(text, fixedRule, ['未识别场景']);
      source = 'fallback';
    }
  } else {
    // === L1+L2 均零命中 + 没配 LLM → 真兜底（source 标明是没配 LLM）===
    console.log('[Engine] 所有层均无命中 + 无 LLM → 万能兜底模板（提示用户配置 LLM）');
    baseResult = ruleAnalyze(text, fixedRule, ['未识别场景']);
    source = 'fallback_no_llm';
  }

  // ========== 把语录漏斗命中的推荐金句追加到 responses 末尾 ==========
  if (funnelQuotes.length > 0) {
    const existingTexts = new Set(baseResult.responses.map((r) => r.text));
    const extras = funnelQuotes
      .filter((q) => !existingTexts.has(q))   // 去重
      .slice(0, 2)                           // 最多加 2 条推荐金句
      .map((q, i) => ({
        id: `${Date.now()}_funnel_${i}`,
        style: 'gentle' as ResponseStyle,
        text: q,
        reason: `${funnelSourceTag} · 推荐金句`,
      }));
    baseResult.responses = [...baseResult.responses, ...extras];
  }

  // ========== 内容安全审查（只拦截，不额外补内容） ==========
  const { safe, blocked } = filterResponses(baseResult.responses);
  if (blocked > 0) {
    console.warn(`[Engine] 内容安全过滤: 拦截 ${blocked} 条, 剩余 ${safe.length} 条`);
  }
  baseResult.responses = safe;

  return {
    ...baseResult,
    source: funnelSourceTag ? `rule_with_funnel_${funnelHit?.hitLayer}` as any : source,
    id: `result_${Date.now()}`,
    utterance: text,
    costMs: Date.now() - startTime,
  };
}

// 工具：给 sourceLabel 用（IntentCard 展示层自己映射）
// source 可能是 rule / llm / fallback / rule_with_funnel_fixed / rule_with_funnel_daily / rule_with_funnel_ai

// 换说法：对单条回话生成变体（LLM 优先，降级取内置备选）
export async function rephraseResponse(
  utterance: string,
  response: Response,
  currentText: string
): Promise<string> {
  console.log('[API] engine.rephraseResponse ← 入口, 风格', response.style);
  const cfg = useAppStore.getState().getActiveLLM();
  if (cfg) {
    try {
      const styleNames: Record<ResponseStyle, string> = {
        gentle: '温和化解',
        humor: '幽默带过',
        direct: '直接拒绝',
        counter: '反将一军'
      };
      const raw = await chatCompletion(
        cfg,
        [
          { role: 'system', content: getPrompt('rewrite') },
          {
            role: 'user',
            content: getPrompt('rephraseUser')
              .replace(/\{\{utterance\}\}/g, utterance)
              .replace(/\{\{currentText\}\}/g, currentText)
              .replace(/\{\{style\}\}/g, styleNames[response.style])
          }
        ],
        { tag: '换说法', ...getModelParams('rephrase') }
      );
      const payload = extractJSON<{ text?: string }>(raw);
      if (payload && payload.text && payload.text.trim()) {
        console.log('[Engine] 换说法成功(LLM)');
        return payload.text.trim();
      }
      console.error('[Engine] 换说法返回解析失败:', raw.slice(0, 200));
    } catch (err) {
      console.error('[Engine] 换说法 LLM 调用失败:', err);
    }
  }
  // 降级：从内置备选轮换
  const variants = response.variants || [];
  if (variants.length > 0) {
    const idx = variants.indexOf(currentText);
    const next = variants[(idx + 1) % variants.length];
    console.log('[Engine] 换说法成功(规则备选)');
    return next;
  }
  return currentText;
}

// 复制到剪贴板
export async function copyText(text: string): Promise<boolean> {
  try {
    await Taro.setClipboardData({ data: text });
    console.log('[Engine] 已复制到剪贴板');
    return true;
  } catch (err) {
    console.error('[Engine] 复制失败:', err);
    return false;
  }
}
