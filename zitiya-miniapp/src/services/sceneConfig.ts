// 场景关键词 + 固定语录 + 意图规则 + 爬虫话题 配置管理
// 规则：代码里 INTENT_RULES / QUOTES / DEFAULT_CRAWL_TOPICS 是默认值（不可删），Storage 里存用户的"覆盖/新增"
//      读取时合并：默认 + 用户覆盖 + 用户新增
// 存储：wx.setStorageSync，key 统一 zuitiya_scene_config

import Taro from '@tarojs/taro';
import { INTENT_RULES, GENERIC_INTENT_KEY } from '@/data/intents';
import type { IntentRule } from '@/data/intents';
import type { Quote } from '@/data/quotes';
import { QUOTES as DEFAULT_QUOTES } from '@/data/quotes';
import type { LLMPreset } from '@/types/settings';
import { LLM_PRESETS } from '@/types/settings';
import { ATTACK_CATEGORIES, ATTACK_SCENES } from '@/data/attackScenes';
import type { AttackScene } from '@/data/attackScenes';
import { userQuotesList } from './userQuotes';
import { logger } from '@/utils/logger';
import { authStore, getAuthState } from '@/store/useUserStore';

const CONFIG_KEY = 'zuitiya_scene_config';

// 默认爬虫话题（短关键词式）—— 云函数 daily_crawler / social_tips_crawler 没配自定义话题时用这个。
// 用短关键词而非短语，因为免费热榜以新闻娱乐为主，短词更易命中热榜标题。
export const DEFAULT_CRAWL_TOPICS: string[] = [
  '拒绝', '情商', '沟通', '回怼', '嘴替', '社交', '相亲', '职场',
  '催婚', '借钱', '婆媳', '内卷', '人际关系', '高情商', '说话', '怼'
];

// 云端 scene_config 集合 _id='main' 的结构
interface CloudSceneConfig {
  _id?: string;
  intents?: IntentRule[];
  fixed_quotes?: Quote[];
  crawl_topics?: string[];
  daily_quote_limit?: number;
  daily_quote_ttl_days?: number;
  api_base?: string;
  prompts?: Record<string, string>;
  model_params?: Record<string, { temperature?: number; maxTokens?: number; timeout?: number }>;
  presets?: LLMPreset[];
  attack_scenes?: AttackScene[];
  attack_categories?: string[];
}

// 云端配置缓存 + 加载状态
let _cloudConfig: CloudSceneConfig | null = null;
let _cloudLoadPromise: Promise<void> | null = null;

/**
 * 启动时调一次：从云数据库 scene_config.doc('main') 加载全量配置
 * 只有微信小程序环境有 wx.cloud，H5 跳过（用代码默认值）
 * 失败不阻塞，继续用代码默认值
 */
export function initCloudConfig(): Promise<void> {
  if (_cloudConfig) return Promise.resolve();
  if (_cloudLoadPromise) return _cloudLoadPromise;

  _cloudLoadPromise = (async () => {
    try {
      // 小程序：读云数据库 scene_config.doc('main')
      if (process.env.TARO_ENV === 'weapp' && typeof Taro !== 'undefined' && Taro.cloud) {
        const db = Taro.cloud.database();
        const res = await db.collection('scene_config').doc('main').get();
        const data = res.data as CloudSceneConfig;
        if (data && (data.intents?.length || data.fixed_quotes?.length)) {
          _cloudConfig = data;
          logger.debug('[SceneConfig] ✅ 云端配置加载:',
            (data.intents?.length || 0), '个意图,',
            (data.fixed_quotes?.length || 0), '条语录,',
            (data.crawl_topics?.length || 0), '个话题'
          );
          return;
        }
      }
      // H5 或小程序云数据没配 → 用代码默认
      logger.debug('[SceneConfig] 使用代码默认配置');
      _cloudConfig = null;
    } catch (err: any) {
      logger.warn('[SceneConfig] 云端加载失败（用默认值）:', err?.message || err);
      _cloudConfig = null;
    }
  })();

  return _cloudLoadPromise;
}

/** 当前是否已从云端加载到配置 */
export function isCloudConfigLoaded(): boolean {
  return _cloudConfig !== null;
}

// 用户可覆盖/新增的数据结构
interface SceneConfigPatch {
  // 某个意图的关键词覆盖（整个替换数组，不是追加）
  keywordOverrides: Record<string, string[]>;
  // 用户自定义新增的固定语录（source='fixed', 但标记为 custom）
  customQuotes: Quote[];
  // 默认意图的字段覆盖（可以覆盖 name/weight/intensity/situation/responses，但 key 不可变）
  intentOverrides: Record<string, Partial<Omit<IntentRule, 'key'>>>;
  // 用户新增的完整意图
  customIntents: IntentRule[];
  // 用户自定义爬虫话题（覆盖默认话题）
  crawlTopics?: string[];
  // LLM system prompt 覆盖（key 见 DEFAULT_PROMPTS）
  prompts?: Record<string, string>;
  // 模型厂商预设的覆盖/新增（不含 API Key，Key 保留在设备本地）
  presets?: LLMPreset[];
  // 漏斗匹配参数覆盖（数值项）—— 已废弃，保留字段只防止旧 Storage 反序列化报错
  funnelConfig?: Record<string, number>;
  // 出招场景库：按 id 覆盖字段（title/desc/category/openings/followups 等，不传保留默认）
  attackSceneOverrides?: Record<string, Partial<AttackScene>>;
  // 出招场景库：用户新增的完整场景
  customAttackScenes?: AttackScene[];
  // 出招分类（覆盖默认分类，第一个元素必须为 '全部'）
  attackCategories?: string[];
  // 模型参数覆盖（按用途档位：default/analyze/rephrase/test），不含 API Key
  modelParams?: Record<string, { temperature?: number; maxTokens?: number; timeout?: number }>;
  // 每日语录缓存 TTL（天），前端 quoteCache 与云函数 daily_crawler 共用
  dailyQuoteTTLDays?: number;
  // 云函数 daily_crawler 每天最多入库条数（默认 100）
  dailyQuoteLimit?: number;
  // 后端 API 基地址（FastAPI 数据服务器），默认 http://localhost:8080，可通过后台/导出覆盖
  apiBase?: string;
}

// LLM system prompt 默认值 —— 可被 Storage.prompts 覆盖
export const DEFAULT_PROMPTS: Record<string, string> = {
  // engine.llmAnalyze：意图识别 + 话术生成（唯一在意图漏斗 L3 层调用的 LLM）
  analyze: `你是「嘴替鸭」，一位专帮内向者（i人）应对社交压力的资深话术教练，精通中国式人情世故。
【输入】别人对用户说的一句原话。说话人可能是亲戚、领导、同事、朋友或陌生人；语气可能委婉、阴阳怪气，也可能直接施压，注意听出弦外之音。
【任务】
1. 意图识别：看穿这句话背后的真实目的，可能同时命中多个意图（如：催婚催生、打探隐私、贬低比较、职场画饼、职场打压、甩锅推责、道德绑架、情感勒索、劝酒逼酒、玩笑越界、越界指挥、开口借钱、服务维权、拒绝邀约、PUA、正常交流等；也可自拟更贴切的名称），按相关度从高到低排列，最多 5 个
2. 强度评估：low=无恶意随口一说；medium=让人不适；high=明显冒犯或施压
3. 处境概括：用户当下的处境与应对要点，40字以内
4. 生成 4 套可直接照着说的回话，顺序和风格固定：
   - gentle（温和化解）：表面接住话、四两拨千斤，不撕破脸
   - humor（幽默带过）：用玩笑或自嘲轻松岔开，气氛不僵
   - direct（直接拒绝）：清晰表明立场和边界，不卑不亢
   - counter（反将一军）：把问题礼貌抛回给对方，可带锋芒但留余地
【要求】
- 口语化，像日常说话，禁止书面腔；每句15~60字
- 得体不憋屈：不委屈自己，也不激化矛盾；理解对方可能是长辈/上级，回话要留情面但不退让底线
- 结合中国式人情场景（饭桌、酒局、家族聚会、办公室），让回话接地气、能自然出口
- 如果对方只是正常交流（问好、关心、闲聊），四套回话都应是友好自然的回应，不要强行树敌
- reason 用一句话解释这句话为什么有效，30字以内
【输出】严格只输出一个 JSON 对象，禁止 markdown 代码块、禁止任何解释或前后缀文字。格式：
{"intents":["意图名称1","意图名称2","意图名称3"],"intensity":"low|medium|high","situation":"处境与应对要点","responses":[{"style":"gentle","text":"回话内容","reason":"有效原因"},{"style":"humor","text":"回话内容","reason":"有效原因"},{"style":"direct","text":"回话内容","reason":"有效原因"},{"style":"counter","text":"回话内容","reason":"有效原因"}]}`,

  // engine.rewriteVariants：回话改写变体的 system prompt
  rewrite: `你是话术改写助手。只输出 JSON，格式：{"text":"改写后的回话"}。`,

  // engine.rephraseResponse：换说法的 user 提示词模板（占位符会被替换）
  rephraseUser: `我正在应对这句话：「{{utterance}}」
我准备说的回话是：「{{currentText}}」（风格：{{style}}）
请换一种说法重写这句回话：保持同样的风格和立场，换不同的句式和措辞，15~60字，口语化，可直接照着说。`
};

// 模型参数默认档位（与 llm.ts / engine.ts 一致；可被 patch.modelParams 覆盖）
// purpose 含义：
//   default  —— chatCompletion 未显式传参时的兜底
//   analyze  —— 拆招分析（engine.llmAnalyze，唯一 LLM 调用点）
//   rephrase —— 换说法（engine.rephraseResponse）
//   test     —— 连接测试（llm.testConnection）
export const DEFAULT_MODEL_PARAMS: Record<string, { temperature: number; maxTokens: number; timeout: number }> = {
  default: { temperature: 0.8, maxTokens: 1500, timeout: 30000 },
  analyze: { temperature: 0.8, maxTokens: 1200, timeout: 25000 },
  rephrase: { temperature: 1.0, maxTokens: 200, timeout: 15000 },
  test: { temperature: 0.0, maxTokens: 20, timeout: 20000 }
};

export const DEFAULT_DAILY_TTL_DAYS = 7;

// 后端 API 基地址（FastAPI 数据服务器）默认值
export const DEFAULT_API_BASE = 'http://localhost:8080';

let _cached: SceneConfigPatch | null = null;

function defaultPatch(): SceneConfigPatch {
  return {
    keywordOverrides: {},
    customQuotes: [],
    intentOverrides: {},
    customIntents: [],
    presets: [],
    funnelConfig: {}
  };
}

/** 加载用户覆盖配置 */
export function loadSceneConfig(): SceneConfigPatch {
  if (_cached) return _cached;
  try {
    const raw = Taro.getStorageSync(CONFIG_KEY);
    if (raw && typeof raw === 'object') {
      _cached = { ...defaultPatch(), ...raw };
      return _cached as SceneConfigPatch;
    }
  } catch (err) {
    logger.warn('[SceneConfig] 读取失败:', err);
  }
  _cached = defaultPatch();
  return _cached;
}

/** 保存用户覆盖配置 */
export function saveSceneConfig(patch: SceneConfigPatch): void {
  try {
    _cached = patch;
    Taro.setStorageSync(CONFIG_KEY, patch);
    logger.debug('[SceneConfig] 已保存');
  } catch (err) {
    logger.warn('[SceneConfig] 保存失败:', err);
  }
}

// ================================================================
// 意图规则（默认 + 覆盖 + 新增）—— 引擎/漏斗全用这个
// ================================================================

/** 获取完整意图规则列表（云端 > 代码默认 > 用户覆盖 > 用户新增） */
export function getAllIntentRules(): IntentRule[] {
  const patch = loadSceneConfig();

  // 1. 基础：云端有就用云端，否则用代码默认
  let base: IntentRule[] = _cloudConfig?.intents?.length
    ? _cloudConfig.intents.map((r) => ({ ...r }))
    : INTENT_RULES.map((r) => ({ ...r }));

  // 2. 本地 Storage 覆盖叠上去（keywordOverrides + intentOverrides）
  for (const rule of base) {
    const kw = patch.keywordOverrides[rule.key] ?? rule.keywords;
    const override = patch.intentOverrides[rule.key];
    const { keywords: _kw, ...overrideWithoutKw } = override || {};
    Object.assign(rule, overrideWithoutKw);
    rule.keywords = kw;
  }

  // 3. 用户新增的意图直接追加
  let result = [...base, ...patch.customIntents];

  // 4. 确保 generic 兜底意图永远存在（云端覆盖了代码默认后可能丢失）
  if (!result.some((r) => r.key === GENERIC_INTENT_KEY)) {
    const fallback = INTENT_RULES.find((r) => r.key === GENERIC_INTENT_KEY);
    if (fallback) {
      logger.debug('[SceneConfig] generic 兜底意图缺失，从代码默认补上');
      result.push({ ...fallback });
    }
  }

  return result;
}

/** 按 key 取单个意图（默认 + 覆盖 + 新增） */
export function getIntentRule(intentKey: string): IntentRule | undefined {
  return getAllIntentRules().find((r) => r.key === intentKey);
}

/** 覆盖某个默认意图的字段（name/weight/intensity/situation/responses） */
export function updateIntent(intentKey: string, patchFields: Partial<Omit<IntentRule, 'key'>>): void {
  const patch = loadSceneConfig();

  // 如果是 customIntents 里的，直接改
  const customIdx = patch.customIntents.findIndex((r) => r.key === intentKey);
  if (customIdx >= 0) {
    patch.customIntents[customIdx] = {
      ...patch.customIntents[customIdx],
      ...patchFields,
      key: intentKey
    };
    saveSceneConfig(patch);
    logger.debug(`[SceneConfig] 已更新自定义意图: ${intentKey}`);
    return;
  }

  // 默认意图：拆成 keywordOverrides + intentOverrides 分别存
  if ('keywords' in patchFields && patchFields.keywords) {
    patch.keywordOverrides[intentKey] = patchFields.keywords;
  }
  const nonKw: Partial<Omit<IntentRule, 'key' | 'keywords'>> = { ...patchFields };
  delete (nonKw as any).keywords;
  if (Object.keys(nonKw).length > 0) {
    patch.intentOverrides[intentKey] = {
      ...patch.intentOverrides[intentKey],
      ...nonKw
    };
  }
  saveSceneConfig(patch);
  logger.debug(`[SceneConfig] 已覆盖默认意图字段: ${intentKey}`);
}

/** 新增一个自定义意图 */
export function addIntent(rule: Omit<IntentRule, 'key'> & { key?: string }): IntentRule {
  const patch = loadSceneConfig();
  // 生成唯一 key
  let key = rule.key || '';
  if (!key) {
    // 从 name 自动生成 key（小写+下划线）
    key = (rule.name || 'custom')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!key || INTENT_RULES.some((r) => r.key === key) || patch.customIntents.some((r) => r.key === key)) {
      key = `custom_${Date.now()}`;
    }
  }

  const newRule: IntentRule = {
    key,
    name: rule.name || '自定义意图',
    keywords: rule.keywords || [],
    weight: rule.weight ?? 1.0,
    intensity: rule.intensity ?? 'medium',
    situation: rule.situation || '',
    responses: rule.responses || []
  };

  // 防止重复 key
  if (INTENT_RULES.some((r) => r.key === key) || patch.customIntents.some((r) => r.key === key)) {
    key = `${key}_${Date.now().toString(36).slice(-4)}`;
    newRule.key = key;
  }

  patch.customIntents.push(newRule);
  saveSceneConfig(patch);
  logger.debug(`[SceneConfig] 已新增自定义意图: ${key} (${newRule.name})`);
  return newRule;
}

/** 删除一个自定义意图（默认的删不动，generic 也删不动） */
export function removeIntent(intentKey: string): boolean {
  if (intentKey === GENERIC_INTENT_KEY) {
    logger.warn('[SceneConfig] 不能删除万能兜底意图');
    return false;
  }
  const patch = loadSceneConfig();
  const isDefault = INTENT_RULES.some((r) => r.key === intentKey);

  if (isDefault) {
    // 默认意图：清空它的覆盖（相当于还原）
    delete patch.keywordOverrides[intentKey];
    delete patch.intentOverrides[intentKey];
    saveSceneConfig(patch);
    logger.debug(`[SceneConfig] 已还原默认意图: ${intentKey}`);
    return true;
  }

  const customIdx = patch.customIntents.findIndex((r) => r.key === intentKey);
  if (customIdx >= 0) {
    patch.customIntents.splice(customIdx, 1);
    saveSceneConfig(patch);
    logger.debug(`[SceneConfig] 已删除自定义意图: ${intentKey}`);
    return true;
  }

  return false;
}

// ================================================================
// 关键词配置（已经走 getAllIntentRules，这里提供便捷接口）
// ================================================================

/** 获取某个意图的关键词（默认 + 用户覆盖） */
export function getKeywordsFor(intentKey: string): string[] {
  const rule = getIntentRule(intentKey);
  return rule ? [...rule.keywords] : [];
}

/** 获取所有意图的关键词 map（给 quoteCache 过滤用） */
export function getAllKeywordMap(): Record<string, string[]> {
  const rules = getAllIntentRules();
  const map: Record<string, string[]> = {};
  for (const rule of rules) {
    map[rule.key] = [...rule.keywords];
  }
  return map;
}

/** 平铺所有关键词（去重，纯匹配用） */
export function getAllKeywordsFlat(): string[] {
  const map = getAllKeywordMap();
  const set = new Set<string>();
  for (const arr of Object.values(map)) {
    for (const kw of arr) set.add(kw);
  }
  return [...set];
}

/** 设置某个意图的关键词（覆盖） */
export function setKeywordsFor(intentKey: string, keywords: string[]): void {
  updateIntent(intentKey, { keywords });
}

/** 给某个意图追加一个关键词 */
export function addKeyword(intentKey: string, keyword: string): void {
  if (!keyword.trim()) return;
  const current = getKeywordsFor(intentKey);
  if (!current.includes(keyword)) {
    updateIntent(intentKey, { keywords: [...current, keyword] });
  }
}

/** 从某个意图删除一个关键词 */
export function removeKeyword(intentKey: string, keyword: string): void {
  const current = getKeywordsFor(intentKey);
  const filtered = current.filter((k) => k !== keyword);
  updateIntent(intentKey, { keywords: filtered });
}

// ================================================================
// 固定语录配置
// ================================================================

/** 获取完整固定语录库（云端 > 代码默认 + 用户补充） */
export function getAllFixedQuotes(): Quote[] {
  const patch = loadSceneConfig();
  const base: Quote[] = _cloudConfig?.fixed_quotes?.length
    ? _cloudConfig.fixed_quotes.map((q) => ({ ...q }))
    : [...DEFAULT_QUOTES];
  return [...base, ...patch.customQuotes];
}

/** 新增一条固定语录 */
export function addFixedQuote(quote: Omit<Quote, 'id' | 'source'> & { source?: 'fixed' }): Quote {
  const patch = loadSceneConfig();
  const newQuote: Quote = {
    ...quote,
    id: `q_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source: 'fixed'
  };
  patch.customQuotes.push(newQuote);
  saveSceneConfig(patch);
  logger.debug('[SceneConfig] 已新增固定语录, 长度', (newQuote.content || '').length);
  return newQuote;
}

/** 删除一条固定语录（只能删 custom 的，默认的删不动） */
export function removeFixedQuote(id: string): boolean {
  const patch = loadSceneConfig();
  const idx = patch.customQuotes.findIndex((q) => q.id === id);
  if (idx >= 0) {
    patch.customQuotes.splice(idx, 1);
    saveSceneConfig(patch);
    return true;
  }
  return false;
}

// ================================================================
// 用户自建语录（user_quotes 云端集合，按 openid 隔离）
// ================================================================

let _userQuotesCache: Quote[] | null = null;
let _userQuotesPromise: Promise<void> | null = null;
// 缓存建立时的登录态：用于识别"未登录时空缓存"，登录后强制重拉
let _userQuotesCacheAtLogin = false;

/**
 * 加载当前登录用户的自建语录到内存缓存
 * 未登录或 H5 环境直接跳过（返回空数组不报错）
 * 失败不阻塞调用方，降级为空
 */
export function initUserQuotes(force = false): Promise<void> {
  // 强制刷新时走一次
  if (!force && _userQuotesCache) {
    // 之前未登录时缓存了空数组，但现在已登录 → 缓存已失效，需要重新拉取
    if (_userQuotesCache.length === 0 && !_userQuotesCacheAtLogin && authStore.isLoggedIn()) {
      logger.debug('[initUserQuotes] 未登录时空缓存，现已登录，重新拉取');
      // fall through 重拉
    } else {
      logger.debug('[initUserQuotes] ✅ 命中内存缓存', _userQuotesCache.length, '条');
      return Promise.resolve();
    }
  }

  // 如果 auth 还在初始化，等它一下再决定（避免 race condition 导致提前缓存空数组）
  const waitForAuthReady = (maxMs = 3000): Promise<void> => new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const st = getAuthState().status;
      if (st !== 'authenticating' || Date.now() - start > maxMs) {
        resolve();
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });

  return (async () => {
    if (getAuthState().status === 'authenticating') {
      logger.debug('[initUserQuotes] auth 还在初始化，等待就绪...');
      await waitForAuthReady();
    }

    // 未登录：缓存空数组，漏斗匹配时自然跳过
    const loggedIn = authStore.isLoggedIn();
    const status = getAuthState().status;
    logger.debug('[initUserQuotes] 检查登录状态 isLoggedIn=', loggedIn, 'storeStatus=', status);
    if (!loggedIn) {
      logger.warn('[initUserQuotes] ⚠️ 未登录，跳过加载');
      _userQuotesCache = [];
      _userQuotesCacheAtLogin = false;
      return;
    }

    if (_userQuotesPromise) {
      logger.debug('[initUserQuotes] ⏳ 已有请求在飞');
      await _userQuotesPromise;
      return;
    }

    _userQuotesPromise = (async () => {
      try {
        if (process.env.TARO_ENV === 'weapp' && typeof Taro !== 'undefined' && Taro.cloud) {
          logger.debug('[initUserQuotes] 📡 开始拉 user_quotes.list ...');
          const list = await userQuotesList();
          _userQuotesCache = list || [];
          _userQuotesCacheAtLogin = true;
          logger.debug('[initUserQuotes] ✅ 拉到', _userQuotesCache.length, '条');
        } else {
          logger.warn('[initUserQuotes] ⚠️ 环境不是 weapp 或 Taro.cloud 不存在，用空');
          _userQuotesCache = [];
        }
      } catch (err: any) {
        logger.error('[initUserQuotes] ❌ userQuotesList 失败:', err?.code, err?.message, err);
        _userQuotesCache = [];
        _userQuotesCacheAtLogin = false;
      } finally {
        _userQuotesPromise = null;
      }
    })();

    await _userQuotesPromise;
  })();
}

/** 获取当前用户自建语录（已缓存，未加载则返回空） */
export function getAllUserQuotes(): Quote[] {
  return _userQuotesCache ?? [];
}

/** 新增/更新/删除后调用，让后续读取拿到最新数据 */
export function invalidateUserQuotes(): void {
  _userQuotesCache = null;
  _userQuotesCacheAtLogin = false;
  // 下次 initUserQuotes 会重新拉
}

// ================================================================
// 爬虫话题配置（给云函数 daily_crawler 用）
// ================================================================

/** 获取完整爬虫话题列表（用户本地覆盖 > 云端 > 代码默认） */
export function getCrawlTopics(): string[] {
  const patch = loadSceneConfig();
  if (patch.crawlTopics?.length) return patch.crawlTopics;
  if (_cloudConfig?.crawl_topics?.length) return [..._cloudConfig.crawl_topics];
  return [...DEFAULT_CRAWL_TOPICS];
}

/** 设置完整话题列表（覆盖） */
export function setCrawlTopics(topics: string[]): void {
  const patch = loadSceneConfig();
  patch.crawlTopics = topics.filter((t) => t.trim());
  saveSceneConfig(patch);
  logger.debug('[SceneConfig] 已设置爬虫话题:', patch.crawlTopics);
}

/** 追加一个话题 */
export function addCrawlTopic(topic: string): void {
  if (!topic.trim()) return;
  const patch = loadSceneConfig();
  const current = patch.crawlTopics ?? [...DEFAULT_CRAWL_TOPICS];
  if (!current.includes(topic)) {
    patch.crawlTopics = [...current, topic];
    saveSceneConfig(patch);
    logger.debug(`[SceneConfig] 已追加话题: ${topic}`);
  }
}

/** 删除一个话题 */
export function removeCrawlTopic(topic: string): void {
  const patch = loadSceneConfig();
  const current = patch.crawlTopics ?? [...DEFAULT_CRAWL_TOPICS];
  const filtered = current.filter((t) => t !== topic);
  // 删空了就回到默认
  patch.crawlTopics = filtered.length > 0 ? filtered : [...DEFAULT_CRAWL_TOPICS];
  saveSceneConfig(patch);
}

// ================================================================
// 每日库参数（云函数 daily_crawler 用）
// ================================================================

const DEFAULT_DAILY_LIMIT = 100;
const DEFAULT_TTL_DAYS = 7;

export function getDailyQuoteLimit(): number {
  return loadSceneConfig().dailyQuoteLimit ?? _cloudConfig?.daily_quote_limit ?? DEFAULT_DAILY_LIMIT;
}
export function setDailyQuoteLimit(n: number): void {
  const patch = loadSceneConfig();
  patch.dailyQuoteLimit = Math.max(1, Math.min(500, Math.round(n)));
  saveSceneConfig(patch);
}

export function getDailyQuoteTTLDays(): number {
  return loadSceneConfig().dailyQuoteTTLDays ?? _cloudConfig?.daily_quote_ttl_days ?? DEFAULT_TTL_DAYS;
}
export function setDailyQuoteTTLDays(d: number): void {
  const patch = loadSceneConfig();
  patch.dailyQuoteTTLDays = Math.max(1, Math.min(30, Math.round(d)));
  saveSceneConfig(patch);
}

// ================================================================
// 调试用：console 一键导出/重置
// ================================================================

export function resetSceneConfig(): void {
  _cached = defaultPatch();
  try { Taro.removeStorageSync(CONFIG_KEY); } catch {}
  logger.debug('[SceneConfig] 已重置为默认值');
}

export function dumpSceneConfig(): void {
  const patch = loadSceneConfig();
  const rules = getAllIntentRules();
  console.group('🦆 SceneConfig 快照');
  logger.debug('Storage 覆盖:', patch);
  logger.debug('完整意图规则 (', rules.length, '个):');
  for (const r of rules) {
    const isCustom = patch.customIntents.some((c) => c.key === r.key);
    const isOverridden = !isCustom && (
      patch.keywordOverrides[r.key] || patch.intentOverrides[r.key]
    );
    const flag = isCustom ? ' 🆕新增' : isOverridden ? ' ⚡已覆盖' : '';
    logger.debug(`  ${r.key} (${r.name}) w=${r.weight}${flag}`);
    logger.debug(`    keywords: [${r.keywords.join(', ')}]`);
  }
  logger.debug('自定义语录:', patch.customQuotes.length, '条');

  // prompts
  const overriddenPrompts = Object.keys(patch.prompts || {});
  if (overriddenPrompts.length > 0) {
    logger.debug('覆盖的 prompt:', overriddenPrompts);
  }
  console.groupEnd();
}

// ================================================================
// LLM System Prompt 配置
// ================================================================

/** 获取完整 prompt map（默认 + 本地覆盖 + 云端后台覆盖） */
export function getAllPrompts(): Record<string, string> {
  const patch = loadSceneConfig();
  const result: Record<string, string> = { ...DEFAULT_PROMPTS };
  if (patch.prompts) {
    Object.assign(result, patch.prompts);
  }
  // 云端后台(admin_config)配置优先
  if (_cloudConfig?.prompts) {
    Object.assign(result, _cloudConfig.prompts);
  }
  return result;
}

/** 按 key 取单个 prompt（给 engine 用） */
export function getPrompt(key: string): string {
  const patch = loadSceneConfig();
  return patch.prompts?.[key] ?? DEFAULT_PROMPTS[key] ?? '';
}

/** 覆盖某个 prompt */
export function setPrompt(key: string, value: string): void {
  const patch = loadSceneConfig();
  if (!patch.prompts) patch.prompts = {};
  patch.prompts[key] = value;
  saveSceneConfig(patch);
  logger.debug(`[SceneConfig] 已覆盖 prompt: ${key}`);
}

/** 删除某个 prompt 的覆盖（还原默认） */
export function resetPrompt(key: string): void {
  const patch = loadSceneConfig();
  if (patch.prompts && patch.prompts[key]) {
    delete patch.prompts[key];
    // 删空了就清理掉这个字段
    if (Object.keys(patch.prompts).length === 0) {
      delete patch.prompts;
    }
    saveSceneConfig(patch);
    logger.debug(`[SceneConfig] 已还原 prompt: ${key}`);
  }
}

// ================================================================
// 模型厂商预设配置（公开配置，不含 API Key）
// ================================================================

/** 获取完整厂商预设（默认 + 本地覆盖/新增 + 云端后台覆盖/新增），设置页与 Store 直接用 */
export function getLLMPresets(): LLMPreset[] {
  const patch = loadSceneConfig();
  const overrideMap: Record<string, LLMPreset> = {};
  const customs: LLMPreset[] = [];
  // 本地 Storage 与云端后台(admin_config)的预设合并后再叠加到代码默认
  const allPresets = [...(patch.presets || []), ...(_cloudConfig?.presets || [])];
  for (const p of allPresets) {
    if (LLM_PRESETS.some((d) => d.key === p.key)) overrideMap[p.key] = p;
    else customs.push(p);
  }
  const merged = LLM_PRESETS.map((d) => ({ ...d, ...(overrideMap[d.key] || {}) }));
  return merged.concat(customs);
}

/** 支持语音识别的厂商预设（与 ASR_PRESETS 逻辑一致） */
export function getAsrPresets(): LLMPreset[] {
  return getLLMPresets().filter((p) => Boolean(p.asrModel) || p.key === 'custom');
}

// ================================================================
// 漏斗匹配参数配置
// ================================================================

// 漏斗参数配置已废弃，quoteFunnel 现在直接用 isRelated 轻量匹配

// ================================================================
// 模型参数配置（默认档位 + 覆盖）

/** 获取某用途档位的模型参数（默认 + 本地覆盖 + 云端后台覆盖），llm/engine 读取 */
export function getModelParams(
  purpose = 'default'
): { temperature: number; maxTokens: number; timeout: number } {
  const patch = loadSceneConfig();
  const base = DEFAULT_MODEL_PARAMS[purpose] || DEFAULT_MODEL_PARAMS.default;
  const local = patch.modelParams?.[purpose];
  const cloud = _cloudConfig?.model_params?.[purpose];
  // 优先级：云端后台(admin_config) > 本地 Storage 覆盖 > 代码默认
  return { ...base, ...(local || {}), ...(cloud || {}) };
}

// ================================================================
// 每日语录 TTL 配置

/** 每日语录缓存 TTL（毫秒），前端 quoteCache 与云函数 daily_crawler 共用 */
export function getDailyQuoteTTLMs(): number {
  const patch = loadSceneConfig();
  const days = patch.dailyQuoteTTLDays ?? DEFAULT_DAILY_TTL_DAYS;
  return Math.max(1, days) * 24 * 60 * 60 * 1000;
}

// 后端 API 基地址：小程序/H5 数据链路打这个地址（FastAPI :8080）
// 公网/H5 部署时通过后台配置或构建期 API_BASE_URL 覆盖；云端后台(admin_config)配置优先于本地
export function getApiBase(): string {
  const cloud = _cloudConfig?.api_base?.trim();
  if (cloud) return cloud;
  const local = loadSceneConfig().apiBase?.trim();
  return local || DEFAULT_API_BASE;
}

// ================================================================
// 出招场景库配置（默认 ATTACK_SCENES + 覆盖/新增）

/** 获取出招分类列表（云端后台 > 本地覆盖 > 代码默认），保证 '全部' 永远排在第一位 */
export function getAttackCategories(): string[] {
  const patch = loadSceneConfig();
  const cloudCats = _cloudConfig?.attack_categories;
  const localCats = patch.attackCategories;
  const base =
    (Array.isArray(cloudCats) && cloudCats.length > 0) ? cloudCats
    : (Array.isArray(localCats) && localCats.length > 0) ? localCats
    : ATTACK_CATEGORIES;
  const cleaned = base.map((c) => String(c).trim()).filter(Boolean);
  const withoutAll = cleaned.filter((c) => c !== '全部');
  return ['全部', ...withoutAll];
}

/** 获取合并后的出招场景列表（云端后台为基 > 代码默认，再叠加本地覆盖/自定义新增） */
export function getAttackScenes(): AttackScene[] {
  const patch = loadSceneConfig();
  const cloudScenes = _cloudConfig?.attack_scenes;
  const base = (cloudScenes && cloudScenes.length ? cloudScenes : ATTACK_SCENES).map((s) => ({ ...s }));
  const overrides = patch.attackSceneOverrides || {};
  const merged = base.map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s));
  const custom = patch.customAttackScenes || [];
  return [...merged, ...custom];
}

/** 按 id 获取单个场景 */
export function getAttackScene(id: string): AttackScene | undefined {
  return getAttackScenes().find((s) => s.id === id);
}

// 自动把 dump 挂到 window，调试方便
if (typeof window !== 'undefined') {
  (window as any).__zuitiya = {
    dumpSceneConfig,
    resetSceneConfig,
    getAllIntentRules,
    getIntentRule,
    addIntent,
    updateIntent,
    removeIntent,
    addKeyword,
    setKeywordsFor,
    removeKeyword,
    getAllFixedQuotes,
    addFixedQuote,
    removeFixedQuote,
    getCrawlTopics,
    setCrawlTopics,
    addCrawlTopic,
    removeCrawlTopic,
    getAllPrompts,
    getPrompt,
    setPrompt,
    resetPrompt,
    getLLMPresets,
    getAsrPresets,
    getModelParams,
    getDailyQuoteTTLMs,
    getApiBase,
    getDailyQuoteLimit,
    setDailyQuoteLimit,
    getDailyQuoteTTLDays,
    setDailyQuoteTTLDays,
    getAttackCategories,
    getAttackScenes,
    getAttackScene
  };
}
