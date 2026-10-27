// 配置模型：默认值（来自小程序源码） + 用户 patch（持久化） = 合并视图
// patch 的 schema 与小程序 LocalStorage 的 zuitiya_scene_config 完全一致，
// 因此后台导出的 JSON 可直接贴回小程序 / 云数据库。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractExport } = require('./extract');

const REPO_ROOT = path.resolve(__dirname, '..', '..'); // admin/ -> 项目根
const SRC = path.join(REPO_ROOT, 'src');
const DATA_DIR = path.join(__dirname, '..', 'data');
const PATCH_PATH = path.join(DATA_DIR, 'scene_config.json');

// 默认漏斗参数（与 quoteFunnel.ts 当前硬编码值保持一致，便于后台调）
const DEFAULT_FUNNEL_CONFIG = {
  minScore: 2,          // matchInLayer 命中阈值
  intentMatchScore: 10, // 语录 intent_key 精准命中加分
  quoteKeywordScore: 2, // 语录自带关键词命中加分
  bidirectionalScore: 3,// 双向命中（输入与语录都含某意图关键词）加分
  tierFixed: 2,         // 固定库排序加权
  tierDaily: 1          // 每日库排序加权
};

// 默认模型参数档位（与 llm.ts / engine.ts / quoteGenerator.ts 当前硬编码值一致）
const DEFAULT_MODEL_PARAMS = {
  default: { temperature: 0.8, maxTokens: 1500, timeout: 30000 },
  analyze: { temperature: 0.8, maxTokens: 1200, timeout: 25000 },
  quoteGen: { temperature: 0.9, maxTokens: 600, timeout: 20000 },
  rephrase: { temperature: 1.0, maxTokens: 200, timeout: 15000 },
  test: { temperature: 0.0, maxTokens: 20, timeout: 20000 }
};

const DEFAULT_DAILY_TTL_DAYS = 7;
const DEFAULT_DAILY_LIMIT = 100; // 云函数 daily_crawler 每天最多入库条数
const DEFAULT_API_BASE = 'http://localhost:8080'; // 小程序/H5 数据服务器（FastAPI）默认地址

// ---- 默认值（从源码提取，启动时缓存）----
let _defaults = null;
function loadDefaults() {
  if (_defaults) return _defaults;
  const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
  const intentRules = extractExport(read('data/intents.ts'), 'INTENT_RULES') || [];
  const quotes = extractExport(read('data/quotes.ts'), 'QUOTES') || [];
  const presets = extractExport(read('types/settings.ts'), 'LLM_PRESETS') || [];
  const prompts = extractExport(read('services/sceneConfig.ts'), 'DEFAULT_PROMPTS') || {};
  const topics = extractExport(read('services/sceneConfig.ts'), 'DEFAULT_CRAWL_TOPICS') || [];
  const attackScenes = extractExport(read('data/attackScenes.ts'), 'ATTACK_SCENES') || [];
  const attackCategories = extractExport(read('data/attackScenes.ts'), 'ATTACK_CATEGORIES') || [];
  const modelParams = extractExport(read('services/sceneConfig.ts'), 'DEFAULT_MODEL_PARAMS') || DEFAULT_MODEL_PARAMS;
  _defaults = {
    intentRules,
    quotes,
    presets,
    prompts,
    topics,
    attackScenes,
    attackCategories,
    modelParams,
    dailyTTLDays: DEFAULT_DAILY_TTL_DAYS,
    genericKey: 'generic'
  };
  return _defaults;
}

// ---- patch 读写 ----
// 合并外部 patch 到空基线，并把所有缺失字段补回默认值（保证 schema 完整）
function coalescePatch(raw) {
  const base = emptyPatch();
  const merged = { ...base, ...raw };
  for (const k of Object.keys(base)) if (merged[k] == null) merged[k] = base[k];
  return merged;
}

// 一次性取「默认值 + 当前 patch」两件套（loadDefaults 内部有缓存，重复调用零成本）
function state() {
  return { d: loadDefaults(), patch: loadPatch() };
}

function emptyPatch() {
  return {
    keywordOverrides: {},
    customQuotes: [],
    intentOverrides: {},
    customIntents: [],
    crawlTopics: [],
    prompts: {},
    presets: [],       // 厂商预设覆盖/新增（key 命中则覆盖，否则追加）
    funnelConfig: {},  // 漏斗参数覆盖
    attackSceneOverrides: {}, // 出招场景按 id 覆盖字段
    customAttackScenes: [],   // 出招场景新增
    attackCategories: [],     // 出招分类覆盖（非空则整体替换）
    modelParams: {},          // 模型参数档位覆盖（default/analyze/quoteGen/rephrase/test）
    dailyQuoteTTLDays: undefined, // 每日语录 TTL（天）
    dailyQuoteLimit: undefined, // 云函数每日入库上限（条）
    apiBase: undefined           // 后端 API 基地址（FastAPI），公网/H5 部署时覆盖
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadPatch() {
  ensureDataDir();
  if (!fs.existsSync(PATCH_PATH)) {
    const p = emptyPatch();
    fs.writeFileSync(PATCH_PATH, JSON.stringify(p, null, 2));
    return p;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(PATCH_PATH, 'utf8'));
    return coalescePatch(raw);
  } catch (e) {
    console.error('[model] patch 解析失败，重置为空:', e.message);
    const p = emptyPatch();
    fs.writeFileSync(PATCH_PATH, JSON.stringify(p, null, 2));
    return p;
  }
}

function savePatch(patch) {
  ensureDataDir();
  fs.writeFileSync(PATCH_PATH, JSON.stringify(patch, null, 2));
}

// ---- 合并视图（与 sceneConfig.ts 对齐）----
function resolveIntents(patch, defaults) {
  const merged = [];
  for (const rule of defaults.intentRules) {
    const kw = patch.keywordOverrides[rule.key]
      ?? patch.intentOverrides[rule.key]?.keywords
      ?? rule.keywords;
    const ov = { ...(patch.intentOverrides[rule.key] || {}) };
    delete ov.keywords;
    merged.push({ ...rule, ...ov, keywords: kw });
  }
  for (const c of patch.customIntents) merged.push(c);
  return merged;
}

function resolveKeywords(patch, defaults) {
  const rules = resolveIntents(patch, defaults);
  const map = {};
  for (const r of rules) map[r.key] = [...r.keywords];
  return map;
}

function resolveQuotes(patch, defaults) {
  return [...defaults.quotes, ...patch.customQuotes];
}

function resolveTopics(patch, defaults) {
  const t = patch.crawlTopics;
  if (Array.isArray(t) && t.length > 0) return t;
  return [...defaults.topics];
}

function resolvePrompts(patch, defaults) {
  return { ...defaults.prompts, ...(patch.prompts || {}) };
}

function resolvePresets(patch, defaults) {
  const overrideMap = {};
  const customs = [];
  for (const p of patch.presets || []) {
    if (defaults.presets.some((d) => d.key === p.key)) overrideMap[p.key] = p;
    else customs.push(p);
  }
  const merged = defaults.presets.map((d) => ({ ...d, ...(overrideMap[d.key] || {}) }));
  return merged.concat(customs);
}

function resolveFunnel(patch) {
  return { ...DEFAULT_FUNNEL_CONFIG, ...(patch.funnelConfig || {}) };
}

function resolveModelParams(patch) {
  const merged = {};
  for (const purpose of Object.keys(DEFAULT_MODEL_PARAMS)) {
    merged[purpose] = { ...DEFAULT_MODEL_PARAMS[purpose], ...(patch.modelParams?.[purpose] || {}) };
  }
  // 容忍：patch 里若有多余的自定义档位也一并带出
  for (const purpose of Object.keys(patch.modelParams || {})) {
    if (!merged[purpose]) merged[purpose] = { ...(patch.modelParams[purpose]) };
  }
  return merged;
}

function resolveDailyTTL(patch) {
  const days = patch.dailyQuoteTTLDays ?? DEFAULT_DAILY_TTL_DAYS;
  return Math.max(1, Number(days) || DEFAULT_DAILY_TTL_DAYS);
}

function resolveDailyLimit(patch) {
  const n = patch.dailyQuoteLimit ?? DEFAULT_DAILY_LIMIT;
  return Math.max(1, Math.min(500, Number(n) || DEFAULT_DAILY_LIMIT));
}

function resolveAttackScenes(patch, defaults) {
  const base = defaults.attackScenes.map((s) => ({ ...s }));
  const overrides = patch.attackSceneOverrides || {};
  const merged = base.map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s));
  const custom = patch.customAttackScenes || [];
  return merged.concat(custom);
}

function resolveAttackCategories(patch, defaults) {
  const base =
    Array.isArray(patch.attackCategories) && patch.attackCategories.length > 0
      ? patch.attackCategories
      : defaults.attackCategories;
  const cleaned = base.map((c) => String(c).trim()).filter(Boolean);
  const withoutAll = cleaned.filter((c) => c !== '全部');
  return ['全部', ...withoutAll];
}

// ---- 工具 ----
function slugify(name) {
  let key = String(name || '').toLowerCase().replace(/[^a-z0-9一-龥]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) key = 'custom';
  return key;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

// ---- 操作 API ----
const api = {
  DEFAULT_FUNNEL_CONFIG,

  getOverview() {
    const { d, patch } = state();
    const intents = resolveIntents(patch, d);
    return {
      defaults: {
        intents: d.intentRules.length,
        quotes: d.quotes.length,
        presets: d.presets.length,
        prompts: Object.keys(d.prompts).length,
        topics: d.topics.length,
        attackScenes: d.attackScenes.length,
        attackCategories: d.attackCategories.length,
        modelParams: Object.keys(d.modelParams).length,
        dailyTTLDays: d.dailyTTLDays
      },
      patch: {
        keywordOverrides: Object.keys(patch.keywordOverrides).length,
        customQuotes: patch.customQuotes.length,
        intentOverrides: Object.keys(patch.intentOverrides).length,
        customIntents: patch.customIntents.length,
        crawlTopics: (patch.crawlTopics || []).length,
        prompts: Object.keys(patch.prompts || {}).length,
        presets: (patch.presets || []).length,
        funnelConfig: Object.keys(patch.funnelConfig || {}).length,
        attackSceneOverrides: Object.keys(patch.attackSceneOverrides || {}).length,
        customAttackScenes: (patch.customAttackScenes || []).length,
        attackCategories: (patch.attackCategories || []).length,
        modelParams: Object.keys(patch.modelParams || {}).length,
        dailyQuoteTTLDays: patch.dailyQuoteTTLDays != null ? patch.dailyQuoteTTLDays : '(default)',
        dailyQuoteLimit: patch.dailyQuoteLimit != null ? patch.dailyQuoteLimit : '(default)',
        apiBase: patch.apiBase || '(default)'
      },
      totals: {
        intents: intents.length,
        quotes: resolveQuotes(patch, d).length,
        topics: resolveTopics(patch, d).length,
        attackScenes: resolveAttackScenes(patch, d).length,
        attackCategories: resolveAttackCategories(patch, d).length
      }
    };
  },

  // 意图
  listIntents() {
    const { d, patch } = state();
    const rules = resolveIntents(patch, d);
    const defaultKeys = new Set(d.intentRules.map((r) => r.key));
    return rules.map((r) => ({
      ...r,
      origin: defaultKeys.has(r.key) ? 'default' : 'custom',
      overridden: !defaultKeys.has(r.key)
        ? false
        : Boolean(patch.keywordOverrides[r.key] || patch.intentOverrides[r.key])
    }));
  },

  getIntent(key) {
    return this.listIntents().find((r) => r.key === key) || null;
  },

  addIntent({ name, keywords, weight, intensity, situation }) {
    const { d, patch } = state();
    let key = slugify(name);
    const used = new Set([...d.intentRules.map((r) => r.key), ...patch.customIntents.map((c) => c.key)]);
    if (used.has(key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;
    const rule = {
      key,
      name: name || '自定义意图',
      keywords: Array.isArray(keywords) ? keywords : (keywords ? String(keywords).split(',').map((s) => s.trim()).filter(Boolean) : []),
      weight: Number(weight) || 1.0,
      intensity: intensity || 'medium',
      situation: situation || '',
      responses: []
    };
    patch.customIntents.push(rule);
    savePatch(patch);
    return rule;
  },

  updateIntent(key, fields) {
    const { d, patch } = state();
    const defaultKeys = new Set(d.intentRules.map((r) => r.key));
    // 自定义意图：直接改
    const ci = patch.customIntents.findIndex((c) => c.key === key);
    if (ci >= 0) {
      patch.customIntents[ci] = { ...patch.customIntents[ci], ...fields, key };
      savePatch(patch);
      return patch.customIntents[ci];
    }
    if (!defaultKeys.has(key)) return null;
    // 默认意图：拆成 keywordOverrides + intentOverrides
    if (fields.keywords != null) patch.keywordOverrides[key] = fields.keywords;
    const nonKw = { ...fields };
    delete nonKw.keywords;
    if (Object.keys(nonKw).length > 0) {
      patch.intentOverrides[key] = { ...(patch.intentOverrides[key] || {}), ...nonKw };
    }
    savePatch(patch);
    return this.getIntent(key);
  },

  removeIntent(key) {
    if (key === loadDefaults().genericKey) return { ok: false, msg: '不能删除万能兜底意图' };
    const { d, patch } = state();
    const before = patch.customIntents.length;
    patch.customIntents = patch.customIntents.filter((c) => c.key !== key);
    if (patch.customIntents.length < before) { savePatch(patch); return { ok: true }; }
    if (d.intentRules.some((r) => r.key === key)) {
      delete patch.keywordOverrides[key];
      delete patch.intentOverrides[key];
      savePatch(patch);
      return { ok: true, restored: true };
    }
    return { ok: false, msg: '意图不存在' };
  },

  // 关键词
  setKeywords(key, keywords) {
    return this.updateIntent(key, { keywords });
  },
  addKeyword(key, kw) {
    const cur = this.getIntent(key);
    if (!cur) return null;
    if (!cur.keywords.includes(kw)) return this.updateIntent(key, { keywords: [...cur.keywords, kw] });
    return cur;
  },
  removeKeyword(key, kw) {
    const cur = this.getIntent(key);
    if (!cur) return null;
    return this.updateIntent(key, { keywords: cur.keywords.filter((k) => k !== kw) });
  },

  // 固定语录
  listQuotes() {
    const { d, patch } = state();
    const all = resolveQuotes(patch, d);
    const customIds = new Set(patch.customQuotes.map((q) => q.id));
    return all.map((q) => ({ ...q, origin: customIds.has(q.id) ? 'custom' : 'default' }));
  },
  addQuote({ content, category, note, keywords }) {
    const patch = loadPatch();
    const q = {
      id: genId('q_custom'),
      content,
      category: category || '社区热话',
      note: note || '',
      source: 'fixed',
      keywords: Array.isArray(keywords) ? keywords : (keywords ? String(keywords).split(',').map((s) => s.trim()).filter(Boolean) : [])
    };
    patch.customQuotes.push(q);
    savePatch(patch);
    return q;
  },
  removeQuote(id) {
    const patch = loadPatch();
    const before = patch.customQuotes.length;
    patch.customQuotes = patch.customQuotes.filter((q) => q.id !== id);
    if (patch.customQuotes.length < before) { savePatch(patch); return { ok: true }; }
    return { ok: false, msg: '默认语录不可删（或找不到）' };
  },

  // 爬虫话题
  listTopics() {
    const { d, patch } = state();
    return resolveTopics(patch, d);
  },
  setTopics(topics) {
    const patch = loadPatch();
    patch.crawlTopics = topics.map((t) => String(t).trim()).filter(Boolean);
    savePatch(patch);
    return patch.crawlTopics;
  },
  addTopic(topic) {
    topic = String(topic || '').trim();
    if (!topic) return null;
    const patch = loadPatch();
    const cur = this.listTopics();
    if (cur.includes(topic)) return cur;
    // 若当前还是默认列表，先复制
    if (!Array.isArray(patch.crawlTopics) || patch.crawlTopics.length === 0) {
      patch.crawlTopics = loadDefaults().topics.slice();
    }
    patch.crawlTopics.push(topic);
    savePatch(patch);
    return patch.crawlTopics;
  },
  removeTopic(topic) {
    const patch = loadPatch();
    const cur = this.listTopics();
    if (!cur.includes(topic)) return cur;
    const filtered = cur.filter((t) => t !== topic);
    patch.crawlTopics = filtered.length > 0 ? filtered : loadDefaults().topics.slice();
    savePatch(patch);
    return patch.crawlTopics;
  },

  // 提示词
  listPrompts() {
    const { d, patch } = state();
    const merged = resolvePrompts(patch, d);
    return Object.keys(d.prompts).map((k) => ({
      key: k,
      value: merged[k] || '',
      overridden: Boolean(patch.prompts && patch.prompts[k] != null)
    }));
  },
  setPrompt(key, value) {
    const patch = loadPatch();
    if (!patch.prompts) patch.prompts = {};
    patch.prompts[key] = value;
    savePatch(patch);
    return { key, value };
  },
  resetPrompt(key) {
    const patch = loadPatch();
    if (patch.prompts) {
      delete patch.prompts[key];
      if (Object.keys(patch.prompts).length === 0) delete patch.prompts;
    }
    savePatch(patch);
    return { ok: true };
  },

  // 厂商预设
  listPresets() {
    const { d, patch } = state();
    return resolvePresets(patch, d).map((p) => ({ ...p }));
  },
  addPreset(preset) {
    const { d, patch } = state();
    const used = new Set([...d.presets.map((p) => p.key), ...patch.presets.map((p) => p.key)]);
    let key = preset.key || slugify(preset.name);
    if (used.has(key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;
    const p = {
      key,
      name: preset.name || key,
      protocol: preset.protocol || 'openai',
      baseURL: preset.baseURL || '',
      model: preset.model || '',
      asrModel: preset.asrModel || '',
      keyUrl: preset.keyUrl || '',
      note: preset.note || ''
    };
    patch.presets.push(p);
    savePatch(patch);
    return p;
  },
  updatePreset(key, fields) {
    const { d, patch } = state();
    const idx = patch.presets.findIndex((p) => p.key === key);
    if (idx >= 0) {
      patch.presets[idx] = { ...patch.presets[idx], ...fields, key };
      savePatch(patch);
      return patch.presets[idx];
    }
    // 覆盖默认预设
    const defIdx = d.presets.findIndex((p) => p.key === key);
    if (defIdx >= 0) {
      patch.presets.push({ ...d.presets[defIdx], ...fields, key });
      savePatch(patch);
      return patch.presets[patch.presets.length - 1];
    }
    return null;
  },
  removePreset(key) {
    const { d, patch } = state();
    // 删自定义
    const before = patch.presets.length;
    patch.presets = patch.presets.filter((p) => p.key !== key);
    if (patch.presets.length < before) { savePatch(patch); return { ok: true }; }
    // 还原默认（删掉覆盖）
    if (d.presets.some((p) => p.key === key)) {
      savePatch(patch);
      return { ok: true, restored: true };
    }
    return { ok: false, msg: '预设不存在' };
  },

  // 漏斗
  getFunnel() {
    const patch = loadPatch();
    return resolveFunnel(patch);
  },
  setFunnel(cfg) {
    const patch = loadPatch();
    const num = {};
    for (const [k, v] of Object.entries(cfg || {})) {
      const n = Number(v);
      if (!Number.isNaN(n)) num[k] = n;
    }
    patch.funnelConfig = { ...(patch.funnelConfig || {}), ...num };
    savePatch(patch);
    return resolveFunnel(patch);
  },

  // 模型参数
  getModelParams() {
    const patch = loadPatch();
    const merged = resolveModelParams(patch);
    const out = {};
    for (const purpose of Object.keys(merged)) {
      out[purpose] = { ...merged[purpose], overridden: Boolean(patch.modelParams && patch.modelParams[purpose]) };
    }
    return out;
  },
  setModelParams(purpose, params) {
    const patch = loadPatch();
    if (!purpose) return null;
    const clean = {};
    if (params.temperature != null) clean.temperature = Number(params.temperature);
    if (params.maxTokens != null) clean.maxTokens = Number(params.maxTokens);
    if (params.timeout != null) clean.timeout = Number(params.timeout);
    patch.modelParams = { ...(patch.modelParams || {}), [purpose]: clean };
    savePatch(patch);
    return resolveModelParams(patch)[purpose];
  },
  resetModelParams(purpose) {
    const patch = loadPatch();
    if (patch.modelParams && patch.modelParams[purpose]) {
      delete patch.modelParams[purpose];
      if (Object.keys(patch.modelParams).length === 0) delete patch.modelParams;
      savePatch(patch);
    }
    return resolveModelParams(patch)[purpose] || null;
  },

  // 每日语录 TTL
  getDailyTTL() {
    const patch = loadPatch();
    return resolveDailyTTL(patch);
  },
  setDailyTTL(days) {
    const patch = loadPatch();
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1) return { ok: false, msg: 'TTL 天数必须 >= 1' };
    patch.dailyQuoteTTLDays = Math.round(n);
    savePatch(patch);
    return patch.dailyQuoteTTLDays;
  },

  // 每日入库上限（条）
  getDailyLimit() {
    const patch = loadPatch();
    return resolveDailyLimit(patch);
  },
  setDailyLimit(n) {
    const patch = loadPatch();
    const v = Number(n);
    if (!Number.isFinite(v) || v < 1) return { ok: false, msg: '每日入库上限必须 >= 1' };
    patch.dailyQuoteLimit = Math.max(1, Math.min(500, Math.round(v)));
    savePatch(patch);
    return patch.dailyQuoteLimit;
  },

  getApiBase() {
    const patch = loadPatch();
    return patch.apiBase || DEFAULT_API_BASE;
  },
  setApiBase(base) {
    const patch = loadPatch();
    const v = (base || '').trim();
    if (!v) return { ok: false, msg: '后端地址不能为空' };
    patch.apiBase = v;
    savePatch(patch);
    return patch.apiBase;
  },

  // ---- 出招场景库 ----
  listAttackScenes() {
    const { d, patch } = state();
    const all = resolveAttackScenes(patch, d);
    const customIds = new Set((patch.customAttackScenes || []).map((s) => s.id));
    return all.map((s) => ({
      ...s,
      origin: customIds.has(s.id) ? 'custom' : 'default',
      overridden: !customIds.has(s.id) ? Boolean(patch.attackSceneOverrides && patch.attackSceneOverrides[s.id]) : false
    }));
  },
  getAttackScene(id) {
    return this.listAttackScenes().find((s) => s.id === id) || null;
  },
  _normalizeScene(input, fallbackId) {
    const s = input || {};
    const openings = Array.isArray(s.openings) ? s.openings.map((x) => String(x)).filter(Boolean) : [];
    const followups = Array.isArray(s.followups)
      ? s.followups
          .map((f) => ({ trigger: String(f.trigger || ''), reply: String(f.reply || '') }))
          .filter((f) => f.trigger || f.reply)
      : [];
    return {
      id: s.id || fallbackId,
      category: s.category || '日常边界',
      title: s.title || '未命名场景',
      desc: s.desc || '',
      openings,
      followups
    };
  },
  addAttackScene(input) {
    const patch = loadPatch();
    const id = (input && input.id) || `as_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const scene = this._normalizeScene(input, id);
    scene.id = id;
    patch.customAttackScenes = patch.customAttackScenes || [];
    patch.customAttackScenes.push(scene);
    savePatch(patch);
    return scene;
  },
  updateAttackScene(id, fields) {
    const { d, patch } = state();
    const ci = (patch.customAttackScenes || []).findIndex((c) => c.id === id);
    if (ci >= 0) {
      const merged = { ...patch.customAttackScenes[ci], ...fields, id };
      patch.customAttackScenes[ci] = this._normalizeScene(merged, id);
      savePatch(patch);
      return patch.customAttackScenes[ci];
    }
    if (d.attackScenes.some((s) => s.id === id)) {
      patch.attackSceneOverrides = patch.attackSceneOverrides || {};
      patch.attackSceneOverrides[id] = { ...(patch.attackSceneOverrides[id] || {}), ...fields };
      savePatch(patch);
      return this.getAttackScene(id);
    }
    return null;
  },
  removeAttackScene(id) {
    const { d, patch } = state();
    patch.customAttackScenes = patch.customAttackScenes || [];
    const before = patch.customAttackScenes.length;
    patch.customAttackScenes = patch.customAttackScenes.filter((c) => c.id !== id);
    if (patch.customAttackScenes.length < before) { savePatch(patch); return { ok: true }; }
    if (d.attackScenes.some((s) => s.id === id)) {
      if (patch.attackSceneOverrides) delete patch.attackSceneOverrides[id];
      savePatch(patch);
      return { ok: true, restored: true };
    }
    return { ok: false, msg: '场景不存在' };
  },
  // 分类
  listAttackCategories() {
    const { d, patch } = state();
    return resolveAttackCategories(patch, d);
  },
  setAttackCategories(cats) {
    const patch = loadPatch();
    const arr = (Array.isArray(cats) ? cats : []).map((c) => String(c).trim()).filter(Boolean);
    const withoutAll = arr.filter((c) => c !== '全部');
    patch.attackCategories = ['全部', ...withoutAll];
    savePatch(patch);
    return patch.attackCategories;
  },
  addAttackCategory(cat) {
    cat = String(cat || '').trim();
    if (!cat) return null;
    const patch = loadPatch();
    const cur = resolveAttackCategories(patch, loadDefaults());
    if (cur.includes(cat)) return cur;
    patch.attackCategories = [...cur, cat];
    savePatch(patch);
    return patch.attackCategories;
  },
  removeAttackCategory(cat) {
    if (cat === '全部') return { ok: false, msg: '「全部」是保留项，不可删除' };
    const patch = loadPatch();
    const cur = resolveAttackCategories(patch, loadDefaults());
    const filtered = cur.filter((c) => c !== cat);
    patch.attackCategories = filtered.length > 1 ? filtered : [];
    savePatch(patch);
    return patch.attackCategories;
  },

  // 意图匹配模拟（与 engine.matchIntent 同逻辑）
  check(utterance) {
    const { d, patch } = state();
    const rules = resolveIntents(patch, d);
    const kwMap = resolveKeywords(patch, d);
    let best = null;
    let bestScore = 0;
    for (const r of rules) {
      const kws = kwMap[r.key] || [];
      let hits = 0;
      for (const kw of kws) if (utterance.includes(kw)) hits += 1;
      if (hits > 0) {
        const score = (Number(r.weight) || 1) * hits;
        if (score > bestScore) { bestScore = score; best = r; }
      }
    }
    const generic = rules.find((r) => r.key === d.genericKey);
    const result = best || generic;
    const matched = result ? (kwMap[result.key] || []).filter((kw) => utterance.includes(kw)) : [];
    return {
      utterance,
      matchedKey: result ? result.key : null,
      matchedName: result ? result.name : null,
      score: bestScore,
      matchedKeywords: matched,
      isGeneric: result ? result.key === d.genericKey : true
    };
  },

  // 导出：LocalStorage 形态（zuitiya_scene_config），可直接贴回小程序
  exportLocalStorage() {
    const patch = loadPatch();
    const out = {
      keywordOverrides: patch.keywordOverrides || {},
      customQuotes: patch.customQuotes || [],
      intentOverrides: patch.intentOverrides || {},
      customIntents: patch.customIntents || [],
      crawlTopics: patch.crawlTopics && patch.crawlTopics.length ? patch.crawlTopics : undefined,
      prompts: patch.prompts && Object.keys(patch.prompts).length ? patch.prompts : undefined,
      presets: patch.presets && patch.presets.length ? patch.presets : undefined,
      funnelConfig: patch.funnelConfig && Object.keys(patch.funnelConfig).length ? patch.funnelConfig : undefined,
      attackSceneOverrides: patch.attackSceneOverrides && Object.keys(patch.attackSceneOverrides).length ? patch.attackSceneOverrides : undefined,
      customAttackScenes: patch.customAttackScenes && patch.customAttackScenes.length ? patch.customAttackScenes : undefined,
      attackCategories: patch.attackCategories && patch.attackCategories.length ? patch.attackCategories : undefined,
      modelParams: patch.modelParams && Object.keys(patch.modelParams).length ? patch.modelParams : undefined,
      dailyQuoteTTLDays: patch.dailyQuoteTTLDays != null ? patch.dailyQuoteTTLDays : undefined,
      dailyQuoteLimit: patch.dailyQuoteLimit != null ? patch.dailyQuoteLimit : undefined,
      apiBase: patch.apiBase != null ? patch.apiBase : undefined
    };
    return out;
  },

  // 导出：云数据库 scene_config 文档（daily_crawler 读 crawlTopics/keywordOverrides/dailyQuoteTTLDays/dailyQuoteLimit）
  exportCloudDB() {
    const patch = loadPatch();
    const topics = this.listTopics();
    return {
      _id: 'main',
      crawlTopics: topics,
      keywordOverrides: patch.keywordOverrides || {},
      // 额外携带 prompts/presets/funnel/modelParams 以便未来云函数扩展读取
      prompts: patch.prompts && Object.keys(patch.prompts).length ? patch.prompts : undefined,
      presets: patch.presets && patch.presets.length ? patch.presets : undefined,
      funnelConfig: patch.funnelConfig && Object.keys(patch.funnelConfig).length ? patch.funnelConfig : undefined,
      attackSceneOverrides: patch.attackSceneOverrides && Object.keys(patch.attackSceneOverrides).length ? patch.attackSceneOverrides : undefined,
      customAttackScenes: patch.customAttackScenes && patch.customAttackScenes.length ? patch.customAttackScenes : undefined,
      attackCategories: patch.attackCategories && patch.attackCategories.length ? patch.attackCategories : undefined,
      modelParams: patch.modelParams && Object.keys(patch.modelParams).length ? patch.modelParams : undefined,
      dailyQuoteTTLDays: patch.dailyQuoteTTLDays != null ? patch.dailyQuoteTTLDays : undefined,
      dailyQuoteLimit: patch.dailyQuoteLimit != null ? patch.dailyQuoteLimit : undefined,
      apiBase: patch.apiBase != null ? patch.apiBase : undefined
    };
  },

  // 导入：把外部 patch JSON 覆盖进来
  importPatch(obj) {
    const merged = coalescePatch(obj);
    savePatch(merged);
    return merged;
  }
};

module.exports = { api, loadDefaults, DEFAULT_FUNNEL_CONFIG, DEFAULT_MODEL_PARAMS, DEFAULT_DAILY_TTL_DAYS, PATCH_PATH };
