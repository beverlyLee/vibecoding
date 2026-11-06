// 云函数 admin_global_llm —— 全局大模型配置（多模型列表）
// 作用：管理后台可配置多个「全局生效」的模型（baseURL + apiKey + model），
//       每个模型独立启用/停用。所有用户在没有个人模型配置时自动复用第一个启用的，
//       AI 能力开箱即用。若主用模型不可用，可按需扩展为 fallback 链。
//
// 安全要点：
//  1. apiKey 只存云端（本集合），普通用户经 getPublic 拿不到 key；
//  2. 实际调用大模型由 llm_proxy 在 received useGlobal 时从本集合读取 key，key 永不下发客户端；
//  3. 严禁 console.log(event) / 打印 apiKey，仅记录 id / protocol / model / baseURL。
//
// 存储结构（一个文档 doc_id='default'，items 存多模型）：
//   { items: [ { id, enabled, name, protocol, baseURL, apiKey, model, asrModel, updatedAt }, ... ] }
//
// action 路由：
//   list       operator 可读全量 items（含 apiKey，供后台编辑回显）
//   saveItem   admin 新增或更新一个条目（按 id upsert）
//   toggle     admin 切换某个条目的 enabled
//   remove     admin 删除某个条目
//   getPublic  任意登录用户：返回第一个 enabled 条目的公开字段（剥离 apiKey），供客户端判断是否启用全局模型
//   test       admin 实测：传入 id 测试指定配置，不传则测第一个 enabled 的

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
function requireAuth() {
  return wxContext();
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

/** 读取整个文档（不存在返回 { items: [] }）
 *  同时处理旧数据迁移：如果文档没有 items 数组但有 baseURL/apiKey/model 等旧格式字段，
 *  自动迁移为 items 数组格式。
 *  兼容"集合尚未创建"场景：微信云开发首次写入 set 会自动创建集合 + 文档。
 */
async function readDoc() {
  let raw;
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get();
    raw = res.data;
  } catch (e) {
    const code = e && (e.errCode || e.code || (e.errMsg && String(e.errMsg)));
    // 文档不存在 / 集合不存在 → 都视为空
    if (code === -1 || code === '-1' ||
        code === -502005 || code === '-502005' ||
        (e && e.errMsg && String(e.errMsg).includes('collection not exists')) ||
        (e && e.errCode === 'DATABASE_DOCUMENT_NOT_EXIST')) {
      return { items: [] };
    }
    throw e;
  }
  if (!raw) return { items: [] };

  // 检测旧格式：没有 items 数组但有 baseURL（或 enabled + apiKey）
  if (!Array.isArray(raw.items) && (raw.baseURL || raw.apiKey || raw.model)) {
    const migrated = {
      items: [{
        id: 'default',
        enabled: raw.enabled === true,
        name: raw.name || '默认模型（迁移）',
        protocol: raw.protocol === 'anthropic' ? 'anthropic' : 'openai',
        baseURL: raw.baseURL || '',
        apiKey: raw.apiKey || '',
        model: raw.model || '',
        asrModel: raw.asrModel || '',
        updatedAt: raw.updatedAt || Date.now(),
      }],
    };
    console.log('[admin_global_llm] 检测到旧格式数据，已自动迁移为 items 数组');
    // 异步写入迁移后的数据（不阻塞本次返回）
    db.collection(COLLECTION).doc(DOC_ID).set({ data: { ...migrated, updatedAt: Date.now() } })
      .catch((err) => console.error('[admin_global_llm] 迁移写入失败:', err && err.message));
    return migrated;
  }

  return { items: raw.items || [] };
}

/** 写入整个文档 */
async function writeDoc(items) {
  await db.collection(COLLECTION).doc(DOC_ID).set({
    data: { items, updatedAt: Date.now() },
  });
}

/** 剥离敏感字段，只留公开信息 */
function toPublic(item) {
  if (!item) return null;
  return {
    id: item.id,
    enabled: !!item.enabled,
    name: item.name || '',
    protocol: item.protocol || 'openai',
    baseURL: item.baseURL || '',
    model: item.model || '',
    asrModel: item.asrModel || '',
  };
}

/** 校验并构造单个条目，返回 { id, enabled, name, protocol, baseURL, apiKey, model, asrModel, updatedAt } 或错误字符串 */
function validateAndBuild(raw) {
  if (!raw || typeof raw !== 'object') return '配置不能为空';
  const enabled = raw.enabled === true;
  const protocol = raw.protocol === 'anthropic' ? 'anthropic' : 'openai';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const baseURL = typeof raw.baseURL === 'string' ? raw.baseURL.trim() : '';
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  const asrModel = typeof raw.asrModel === 'string' ? raw.asrModel.trim() : '';

  if (enabled) {
    if (!baseURL) return '启用模型必须填写 baseURL';
    if (!apiKey) return '启用模型必须填写 API Key';
    if (!model) return '启用模型必须填写 model';
  }
  return {
    enabled,
    name: name || (protocol === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'),
    protocol,
    baseURL,
    apiKey,
    model,
    asrModel,
    updatedAt: Date.now(),
  };
}

// ================================================================
// action: list（operator+，含 apiKey）
// ================================================================
async function actionList() {
  await requireRole('operator');
  const doc = await readDoc();
  const items = (doc.items || []).map((it) => ({ ...toPublic(it), apiKey: it.apiKey || '', updatedAt: it.updatedAt }));
  return reply(0, 'ok', items);
}

// ================================================================
// action: saveItem（admin，新增或更新一个条目；按 id upsert）
// ================================================================
async function actionSaveItem(event) {
  await requireRole('admin');
  const raw = event && event.value;
  const built = validateAndBuild(raw);
  if (typeof built === 'string') return err(built);

  const doc = await readDoc();
  const items = [...(doc.items || [])];
  const id = (raw && raw.id) ? String(raw.id) : `llm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const idx = items.findIndex((it) => it.id === id);
  if (idx >= 0) {
    // 更新：保留原有字段里 apiKey 若未填写则沿用老值
    const existing = items[idx];
    const merged = {
      ...existing,
      ...built,
      id,
      apiKey: built.apiKey || existing.apiKey || '', // 允许空 apiKey 时保留原 key
    };
    items[idx] = merged;
  } else {
    items.push({ id, ...built });
  }
  await writeDoc(items);
  console.log('[admin_global_llm.saveItem] id=', id, 'enabled=', built.enabled, 'model=', built.model);
  return reply(0, 'ok', { id });
}

// ================================================================
// action: toggle（admin，切换 enabled）
// ================================================================
async function actionToggle(event) {
  await requireRole('operator');
  const id = event && event.id;
  if (!id) return err('缺少 id');
  const doc = await readDoc();
  const items = [...(doc.items || [])];
  const idx = items.findIndex((it) => it.id === id);
  if (idx < 0) return err('模型条目不存在');
  items[idx] = { ...items[idx], enabled: !items[idx].enabled, updatedAt: Date.now() };
  await writeDoc(items);
  console.log('[admin_global_llm.toggle] id=', id, 'enabled=', items[idx].enabled);
  return reply(0, 'ok', { enabled: items[idx].enabled });
}

// ================================================================
// action: remove（admin）
// ================================================================
async function actionRemove(event) {
  await requireRole('admin');
  const id = event && event.id;
  if (!id) return err('缺少 id');
  const doc = await readDoc();
  const items = (doc.items || []).filter((it) => it.id !== id);
  await writeDoc(items);
  console.log('[admin_global_llm.remove] id=', id);
  return reply(0, 'ok', null);
}

// ================================================================
// action: getPublic（任意登录用户，返回第一个 enabled 的公开字段）
// ================================================================
async function actionGetPublic() {
  requireAuth();
  const doc = await readDoc();
  const first = (doc.items || []).find((it) => it.enabled);
  return reply(0, 'ok', toPublic(first) || null);
}

// ================================================================
// action: test（admin，实测指定 id / 透传配置 / 第一个 enabled）
//   - 传 config：直接用透传的配置测（编辑表单里点连接测试时用，不依赖已保存）
//   - 传 id：读取数据库中对应条目测
//   - 都不传：测第一个 enabled 的
// ================================================================
async function actionTest(event) {
  await requireRole('admin');
  let target;
  if (event && event.config) {
    const c = event.config;
    if (!c.baseURL || !c.apiKey || !c.model) return err('配置不完整：缺少 baseURL / apiKey / model');
    target = { protocol: c.protocol || 'openai', baseURL: c.baseURL, apiKey: c.apiKey, model: c.model };
  } else {
    const doc = await readDoc();
    const items = doc.items || [];
    if (event && event.id) target = items.find((it) => it.id === event.id);
    else target = items.find((it) => it.enabled);
    if (!target) return err('未找到可测试的配置，请先保存或填写完整配置');
    if (!target.apiKey || !target.baseURL || !target.model) return err('配置不完整：缺少 apiKey / baseURL / model');
  }
  try {
    // 测试链路 = 生产链路：都走 llm_proxy，保证一致性
    console.log('[admin_global_llm.test] 转发到 llm_proxy, model=', target.model);
    const res = await cloud.callFunction({
      name: 'llm_proxy',
      data: {
        useGlobal: false,
        protocol: target.protocol || 'openai',
        baseURL: target.baseURL,
        apiKey: target.apiKey,
        model: target.model,
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
    const text = String(result.data && result.data.text || '').trim().slice(0, 30);
    return reply(0, 'ok', { message: '连接成功：' + text });
  } catch (e) {
    console.error('[admin_global_llm.test] 异常:', e && e.message);
    return err('连接测试异常：' + (e && e.message || String(e)));
  }
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';
  const handlers = {
    list: actionList,
    saveItem: actionSaveItem,
    toggle: actionToggle,
    remove: actionRemove,
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
