// 云函数 admin_global_llm —— 全局大模型配置（仅一份，doc _id='default'）
// 作用：管理后台配置一个「全局生效」的模型（baseURL + apiKey + model），
//       所有用户在没有个人模型配置时自动复用，AI 能力开箱即用。
//
// 安全要点：
//  1. apiKey 只存云端（本集合），普通用户经 getPublic 拿不到 key；
//  2. 实际调用大模型由 llm_proxy 在 received useGlobal 时从本集合读取 key，key 永不下发客户端；
//  3. 严禁 console.log(event) / 打印 apiKey，仅记录 protocol / model / baseURL。
//
// action 路由：
//   get        operator 可读全量（含 apiKey，供后台编辑回显）
//   set        admin 可写，字段校验防注入
//   getPublic  任意登录用户可读公开字段（剥离 apiKey），供客户端判断是否启用全局模型
//   test       admin 实测：调用 llm_proxy(useGlobal) 验证全局配置可用

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'global_llm_config';
const DOC_ID = 'default';

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
// 任意登录用户（用于 getPublic），无身份直接拒
function requireAuth() {
  const wx = wxContext();
  return wx;
}
async function findByOpenid(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data[0] || null;
}
async function requireRole(required) {
  const wx = wxContext();
  const caller = await findByOpenid(wx.OPENID);
  if (!caller) throw Object.assign(new Error('账号不存在'), { status: 401 });
  if (caller.status === 'banned') throw Object.assign(new Error('账号已被封禁'), { status: 403 });
  const LEVEL = { admin: 3, operator: 2, user: 1 };
  const reqLevel = LEVEL[required] || 0;
  const curLevel = LEVEL[caller.role] || 0;
  if (curLevel < reqLevel) throw Object.assign(new Error('权限不足，需要 ' + required), { status: 403 });
  return caller;
}

/** 读取当前全局配置文档（不存在返回 null） */
async function readDoc() {
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get();
    return res.data || null;
  } catch (e) {
    if (e && (e.errCode === -1 || e.errCode === 'DATABASE_DOCUMENT_NOT_EXIST')) return null;
    throw e;
  }
}

/** 剥离敏感字段，只留公开信息 */
function toPublic(doc) {
  if (!doc) return null;
  return {
    enabled: !!doc.enabled,
    name: doc.name || '',
    protocol: doc.protocol || 'openai',
    baseURL: doc.baseURL || '',
    model: doc.model || '',
    asrModel: doc.asrModel || '',
  };
}

// 字段校验：set 时调用，缺 baseURL/model 不允许启用
function validateAndBuild(value) {
  if (!value || typeof value !== 'object') return '配置不能为空';
  const enabled = value.enabled === true;
  const protocol = value.protocol === 'anthropic' ? 'anthropic' : 'openai';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const baseURL = typeof value.baseURL === 'string' ? value.baseURL.trim() : '';
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  const asrModel = typeof value.asrModel === 'string' ? value.asrModel.trim() : '';

  if (enabled) {
    if (!baseURL) return '启用全局模型必须填写 baseURL';
    if (!apiKey) return '启用全局模型必须填写 API Key';
    if (!model) return '启用全局模型必须填写 model';
  }
  return {
    enabled,
    name: name || (protocol === 'anthropic' ? '全局模型(Anthropic)' : '全局模型'),
    protocol,
    baseURL,
    apiKey,
    model,
    asrModel,
    updatedAt: Date.now(),
  };
}

// ================================================================
// action: get（operator+，含 apiKey）
// ================================================================
async function actionGet() {
  await requireRole('operator');
  const doc = await readDoc();
  return reply(0, 'ok', doc ? { ...toPublic(doc), apiKey: doc.apiKey || '' } : null);
}

// ================================================================
// action: set（admin）
// ================================================================
async function actionSet(event) {
  await requireRole('admin');
  const built = validateAndBuild(event && event.value);
  if (built && built.code) return built; // 不会走到这（validateAndBuild 不返回 {code}）
  if (typeof built === 'string') return err(built);

  const current = (await readDoc()) || {};
  const next = { ...current, ...built };
  await db.collection(COLLECTION).doc(DOC_ID).set({ data: next });
  console.log('[admin_global_llm.set] 已保存全局模型配置, enabled =', next.enabled);
  return reply(0, 'ok', { ...toPublic(next), apiKey: next.apiKey || '' });
}

// ================================================================
// action: getPublic（任意登录用户，剥离 apiKey）
// ================================================================
async function actionGetPublic() {
  requireAuth(); // 必须登录，但未要求角色
  const doc = await readDoc();
  return reply(0, 'ok', toPublic(doc));
}

// ================================================================
// action: test（admin，实测全局配置）
// ================================================================
async function actionTest() {
  await requireRole('admin');
  const doc = await readDoc();
  if (!doc || !doc.enabled || !doc.apiKey || !doc.baseURL || !doc.model) {
    return err('全局模型未配置或未启用，请先保存配置');
  }
  try {
    const res = await cloud.callFunction({
      name: 'llm_proxy',
      data: {
        useGlobal: true,
        protocol: doc.protocol || 'openai',
        baseURL: doc.baseURL,
        model: doc.model,
        messages: [{ role: 'user', content: '你好，这是连接测试，请只回复两个字：成功' }],
        temperature: 0,
        maxTokens: 20,
        timeout: 20000,
      },
    });
    const result = res && res.result;
    if (!result || result.code !== 0) {
      return err('连接失败：' + ((result && result.message) || '未知错误'));
    }
    return reply(0, 'ok', { message: '连接成功：' + String(result.data && result.data.text || '').slice(0, 30) });
  } catch (e) {
    return err('连接测试异常：' + (e && e.message || String(e)));
  }
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';
  const handlers = {
    get: actionGet,
    set: actionSet,
    getPublic: actionGetPublic,
    test: actionTest,
  };
  const handler = handlers[action];
  if (!handler) return err('未知 action: ' + action, 400);
  try {
    return await handler(event, context);
  } catch (e) {
    console.error('[admin_global_llm.' + action + '] 异常:', e && e.message);
    const status = e && e.status;
    if (status === 401) return err(e.message || '未登录', 401);
    if (status === 403) return err(e.message || '权限不足', 403);
    return err(e && e.message || String(e), 500);
  }
};
