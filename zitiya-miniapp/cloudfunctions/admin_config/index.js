// 云函数 admin_config —— 嘴替鸭场景配置管理（仅 operator 可读，admin 可写）
//
// 聚合 action 路由：
//   getConfig     读取 scene_config.doc('main') 全量配置（operator +）
//   saveSection   写入某个配置区块（admin），字段白名单防注入
//   resetSection  把某个区块还原为默认（admin），写入 null
//
// 数据位置：云数据库集合 scene_config，固定文档 _id = 'main'
// 鉴权：与 admin_users 一致，统一用 requireRole()，客户端无法伪造身份。
//
// 注意：这里写的是「全局配置」，小程序机器人通过 get_scene_config 云函数 /
//       sceneConfig.ts 读取同一文档，所以后台改完立即对所有用户生效。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'scene_config';
const DOC_ID = 'main';

// 允许写入的顶层字段白名单（防止客户端注入任意字段）
const ALLOWED_SECTIONS = {
  intents: 'array',
  fixed_quotes: 'array',
  crawl_topics: 'array',
  daily_quote_limit: 'number',
  daily_quote_ttl_days: 'number',
  api_base: 'string',
  prompts: 'object',
  model_params: 'object',
  presets: 'array',
  attack_scenes: 'array',
  attack_categories: 'array',
};

// ================================================================
// 工具函数
// ================================================================

function reply(code, message, data = null) {
  return { code, message, data };
}

function err(message, code = 1) {
  return reply(code, message, null);
}

function wxContext() {
  const ctx = cloud.getWXContext();
  if (!ctx.OPENID) throw new Error('无法识别微信身份');
  return ctx;
}

async function findByOpenid(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}

async function requireRole(required) {
  const wx = wxContext();
  const caller = await findByOpenid(wx.OPENID);
  if (!caller) {
    throw Object.assign(new Error('账号不存在'), { status: 401 });
  }
  if (caller.status === 'banned') {
    throw Object.assign(new Error('账号已被封禁'), { status: 403 });
  }
  const LEVEL = { admin: 3, operator: 2, user: 1 };
  const reqLevel = LEVEL[required] || 0;
  const curLevel = LEVEL[caller.role] || 0;
  if (curLevel < reqLevel) {
    throw Object.assign(new Error('权限不足，需要 ' + required), { status: 403 });
  }
  return caller;
}

/** 系统保留字段（微信云开发文档自带）：写入时不能带进 set({data})，否则会报 _id 非法导致保存失败 */
const SYS_FIELDS = ['_id', '_openid', '_createTime', '_updateTime'];

/** 读取当前配置文档（不存在返回空对象，不让调用方崩）；剔除系统字段，避免 saveSection/resetSection 把 _id 写回 set({data}) 触发报错 */
async function readDoc() {
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get();
    const data = res.data || {};
    const { _id, _openid, _createTime, _updateTime, ...clean } = data;
    return clean;
  } catch (e) {
    // doc 不存在
    if (e && (e.errCode === -1 || e.errCode === 'DATABASE_DOCUMENT_NOT_EXIST')) {
      return {};
    }
    throw e;
  }
}

/** 轻量校验：值与白名单声明的类型大致匹配 */
function validateSection(section, value) {
  const expect = ALLOWED_SECTIONS[section];
  if (!expect) return '未知配置区块: ' + section;
  if (value === null || value === undefined) return null; // 允许置空（还原默认）
  if (expect === 'array' && !Array.isArray(value)) return section + ' 必须是数组';
  if (expect === 'object' && (typeof value !== 'object' || Array.isArray(value))) return section + ' 必须是对象';
  if (expect === 'number' && (typeof value !== 'number' || isNaN(value))) return section + ' 必须是数字';
  if (expect === 'string' && typeof value !== 'string') return section + ' 必须是字符串';
  return null;
}

// ================================================================
// action: getConfig
// ================================================================
async function actionGetConfig() {
  await requireRole('operator');
  const doc = await readDoc();
  // 去掉 _id 等内部字段，只回吐业务字段
  const { _id, _openid, ...rest } = doc;
  return reply(0, 'ok', rest);
}

// ================================================================
// action: saveSection
// ================================================================
async function actionSaveSection(event) {
  await requireRole('admin');
  const { section, value } = event || {};
  if (!section) return err('缺少 section');

  const validErr = validateSection(section, value);
  if (validErr) return err(validErr);

  const current = await readDoc();
  const next = { ...current, [section]: value };
  await db.collection(COLLECTION).doc(DOC_ID).set({ data: next });

  console.log(`[admin_config.saveSection] ${section} 已保存`);
  return reply(0, 'ok', { section, value });
}

// ================================================================
// action: resetSection
// ================================================================
async function actionResetSection(event) {
  await requireRole('admin');
  const { section } = event || {};
  if (!section) return err('缺少 section');
  if (!ALLOWED_SECTIONS[section]) return err('未知配置区块: ' + section);

  const current = await readDoc();
  const next = { ...current };
  delete next[section]; // 删除该字段 → 小程序侧回退到代码默认值
  await db.collection(COLLECTION).doc(DOC_ID).set({ data: next });

  console.log(`[admin_config.resetSection] ${section} 已还原默认`);
  return reply(0, 'ok', { section });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';

  const handlers = {
    getConfig: actionGetConfig,
    saveSection: actionSaveSection,
    resetSection: actionResetSection,
  };

  const handler = handlers[action];
  if (!handler) {
    return err(`未知 action: ${action}`, 400);
  }

  try {
    return await handler(event, context);
  } catch (e) {
    console.error(`[admin_config.${action}] 异常:`, e);
    const status = e && e.status;
    if (status === 401) return err(e.message || '未登录', 401);
    if (status === 403) return err(e.message || '权限不足', 403);
    return err(e.message || String(e), 500);
  }
};
