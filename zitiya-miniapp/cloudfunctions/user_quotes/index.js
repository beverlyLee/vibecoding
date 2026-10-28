// 云函数 user_quotes —— 嘴替鸭「我的语录」
//
// 所有 action 的语录数据都带 openid 字段，读取时严格按 openid 隔离，
// 确保每个用户只能看到/修改自己的语录。
//
// action 路由：
//   list      列出当前用户全部语录，按 createdAt 倒序
//   add       新增一条语录
//   update    修改语录内容（只能改自己的）
//   remove    删除语录（只能删自己的）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLL = 'user_quotes';

// 结构化日志：统一输出 JSON 一行，便于云开发控制台检索
const clog = console.log.bind(console);
function logf(level, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  clog(JSON.stringify({ ts: Date.now(), level, fn: 'user_quotes', msg }));
}

const MAX_CONTENT = 500;
const MAX_NOTE = 200;
const MAX_KEYWORDS = 20;

// ================================================================
// 工具
// ================================================================

function reply(code, message, data = null) { return { code, message, data }; }
function err(message, code = 1) { return reply(code, message, null); }

function getOpenid() {
  const openid = cloud.getWXContext().OPENID;
  if (!openid) throw new Error('无法识别微信身份');
  return openid;
}

/** 规范化语录 payload，过滤非法字段 + 长度校验 */
function sanitizeQuote(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('参数错误');
  }
  const out = { openid: getOpenid() };

  if (typeof input.content !== 'string' || !input.content.trim()) {
    throw new Error('语录内容不能为空');
  }
  out.content = input.content.trim().slice(0, MAX_CONTENT);

  out.category = typeof input.category === 'string' && input.category.trim()
    ? input.category.trim().slice(0, 30) : '自定义';
  out.note = typeof input.note === 'string' && input.note.trim()
    ? input.note.trim().slice(0, MAX_NOTE) : '';

  if (Array.isArray(input.keywords)) {
    out.keywords = input.keywords
      .filter((k) => typeof k === 'string' && k.trim())
      .map((k) => k.trim().slice(0, 20))
      .slice(0, MAX_KEYWORDS);
  } else {
    out.keywords = [];
  }

  if (typeof input.author === 'string' && input.author.trim()) {
    out.author = input.author.trim().slice(0, 30);
  }
  if (typeof input.intent_key === 'string' && input.intent_key.trim()) {
    out.intent_key = input.intent_key.trim().slice(0, 50);
  }

  return out;
}

/** 数据库记录 → 前端 Quote */
function toQuote(row) {
  if (!row) return null;
  return {
    id: row._id,
    content: row.content,
    category: row.category || '自定义',
    note: row.note || '',
    keywords: row.keywords || [],
    author: row.author || '',
    intent_key: row.intent_key || '',
    source: 'user',
    fetched_at: row.createdAt ? new Date(row.createdAt).getTime() : 0,
  };
}

// ================================================================
// action: list
// ================================================================
async function actionList() {
  const openid = getOpenid();
  const res = await db.collection(COLL)
    .where({ openid })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  const quotes = res.data.map(toQuote);
  logf('info',`[user_quotes.list] openid=${openid} → ${quotes.length} 条`);
  return reply(0, 'ok', quotes);
}

// ================================================================
// action: add
// ================================================================
async function actionAdd(event) {
  const openid = getOpenid();
  const data = sanitizeQuote(event);
  const now = db.serverDate();

  const saved = await db.collection(COLL).add({
    data: { ...data, createdAt: now, updatedAt: now }
  });

  const doc = await db.collection(COLL).doc(saved._id).get();
  logf('info',`[user_quotes.add] openid=${openid} 新增 id=${saved._id}`);

  return reply(0, 'ok', toQuote(doc.data));
}

// ================================================================
// action: update
// ================================================================
async function actionUpdate(event) {
  const openid = getOpenid();
  const { id, ...patchInput } = event || {};

  // === 1. id 参数校验 ===
  if (!id || typeof id !== 'string' || id.length < 1) {
    logf('warn',`[user_quotes.update] ❌ 缺少或非法 id:`, JSON.stringify(id));
    return err('缺少语录 id', 400);
  }

  // === 2. 规范化待更新字段 ===
  const sanitized = sanitizeQuote({ ...patchInput, content: patchInput.content || 'x' });
  const allowed = ['content', 'category', 'note', 'keywords', 'author', 'intent_key'];
  const updateData = {};
  for (const f of allowed) {
    if (f in sanitized && f !== 'openid') updateData[f] = sanitized[f];
  }
  updateData.updatedAt = db.serverDate();
  if (Object.keys(updateData).length <= 1) {
    logf('warn',`[user_quotes.update] ❌ 没有可更新字段`);
    return err('没有可更新字段', 400);
  }

  // === 3. 找到文档并校验归属 ===
  let raw = null;
  try {
    raw = await db.collection(COLL).doc(id).get();
  } catch (e) {
    logf('warn',`[user_quotes.update] ❌ doc(${id}).get() 失败: errCode=${e?.errCode} errMsg=${e?.errMsg}`);
    return err(`语录不存在 (${e?.errMsg || 'doc not found'})`, 404);
  }

  // ⚠️ 云函数里 doc(id).get() 返回 { data: {...}, errMsg }，不是 doc 直接！
  const existing = raw?.data || raw;
  if (!existing || !existing._id) {
    logf('warn',`[user_quotes.update] ❌ existing 为空或无 _id, raw=`, JSON.stringify(raw)?.slice(0, 200));
    return err('语录不存在', 404);
  }

  // 归属校验
  if (existing.openid !== openid) {
    logf('warn',`[user_quotes.update] ❌ 归属校验失败 docOpenid=${existing.openid} callerOpenid=${openid}`);
    return err('语录不存在或无权限', 404);
  }

  logf('info',`[user_quotes.update] ✅ 归属通过 doc(${id}) openid=${openid}, 准备更新:`,
    Object.keys(updateData).join(','));

  // === 4. 执行更新 ===
  try {
    await db.collection(COLL).doc(id).update({ data: updateData });
  } catch (e) {
    logf('error',`[user_quotes.update] ❌ update 失败: errCode=${e?.errCode} errMsg=${e?.errMsg}`);
    return err(`更新失败: ${e?.errMsg || e?.message || 'unknown'}`, 500);
  }

  // === 5. 读回最新文档 ===
  let freshRaw;
  try {
    freshRaw = await db.collection(COLL).doc(id).get();
  } catch (e) {
    logf('error',`[user_quotes.update] ❌ 更新后读回失败:`, e?.errMsg || e);
    return reply(0, 'ok', toQuote(existing));
  }

  const fresh = freshRaw?.data || freshRaw;
  logf('info',`[user_quotes.update] ✅ 成功 id=${id}, keywords=${JSON.stringify(updateData.keywords)}`);
  return reply(0, 'ok', toQuote(fresh));
}

// ================================================================
// action: remove
// ================================================================
async function actionRemove(event) {
  const openid = getOpenid();
  const { id } = event || {};
  if (!id || typeof id !== 'string') return err('缺少语录 id', 400);

  let raw = null;
  try {
    raw = await db.collection(COLL).doc(id).get();
  } catch (e) {
    logf('warn',`[user_quotes.remove] ❌ doc(${id}).get() 失败:`, e?.errMsg || e);
    return err('语录不存在', 404);
  }
  const existing = raw?.data || raw;
  if (!existing || existing.openid !== openid) {
    return err('语录不存在或无权限', 404);
  }

  await db.collection(COLL).doc(id).remove();
  logf('info',`[user_quotes.remove] ✅ openid=${openid} 删除 id=${id}`);

  return reply(0, 'ok', { id });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || 'list';

  const handlers = {
    list: actionList,
    add: actionAdd,
    update: actionUpdate,
    remove: actionRemove,
  };

  const handler = handlers[action];
  if (!handler) return err(`未知 action: ${action}`, 400);

  try {
    return await handler(event, context);
  } catch (e) {
    logf('error',`[user_quotes.${action}] ❌ 异常:`, e?.message || e);
    return err(e.message || String(e), 500);
  }
};
