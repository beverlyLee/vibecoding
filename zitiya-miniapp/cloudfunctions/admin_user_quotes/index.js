// 云函数 admin_user_quotes —— 管理后台「我的语录库」管理（跨用户视角）
// 读写云数据库集合 user_quotes（每条带 openid，普通用户只能看自己的；本云函数给管理员全量视角）
// 鉴权复用 admin_config 的 requireRole：operator 可读(list/stats)，admin 可删(remove)
//
// action 路由：
//   list   按用户(openid) / 时间范围 / 关键词筛选 + 分页，联表 users 取昵称/头像
//   stats  按用户维度统计每个用户录入条数 + 全站总数 + 最近 N 天每日趋势
//   remove 删除单条（admin 权限，无视归属，用于清理脏数据）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLL = 'user_quotes';
const MAX_LIMIT = 1000;

function reply(code, message, data = null) { return { code, message, data }; }
function err(message, code = 1) { return reply(code, message, null); }

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
  if (!caller) throw Object.assign(new Error('账号不存在'), { status: 401 });
  if (caller.status === 'banned') throw Object.assign(new Error('账号已被封禁'), { status: 403 });
  const LEVEL = { admin: 3, operator: 2, user: 1 };
  const reqLevel = LEVEL[required] || 0;
  const curLevel = LEVEL[caller.role] || 0;
  if (curLevel < reqLevel) throw Object.assign(new Error('权限不足，需要 ' + required), { status: 403 });
  return caller;
}

// 兼容 users 集合里可能的字段命名差异
function pickNickname(u) {
  if (!u) return '未知用户';
  return u.nickname || u.nickName || u.wxNickName || u.name || '未知用户';
}
function pickAvatar(u) {
  if (!u) return '';
  return u.avatar || u.avatarUrl || u.wxAvatarUrl || '';
}

/** 批量按 openid 拉 users，返回 openid -> user 映射（每批最多 20，避免 in 过大） */
async function getUserMap(openids) {
  const map = {};
  if (!openids.length) return map;
  const batches = [];
  for (let i = 0; i < openids.length; i += 20) batches.push(openids.slice(i, i + 20));
  for (const b of batches) {
    const res = await db.collection('users').where({ openid: _.in(b) }).limit(100).get();
    for (const u of res.data) map[u.openid] = u;
  }
  return map;
}

function buildWhere({ openid, startDay, endDay, keyword }) {
  const where = {};
  if (openid && openid !== 'all') where.openid = openid;
  if (startDay || endDay) {
    const range = {};
    if (startDay) range.$gte = new Date(startDay + 'T00:00:00');
    if (endDay) range.$lte = new Date(endDay + 'T23:59:59.999');
    where.createdAt = range;
  }
  if (keyword && keyword.trim()) {
    where.content = db.RegExp({ regexp: keyword.trim(), options: 'i' });
  }
  return where;
}

// ================================================================
// action: list
// ================================================================
async function actionList(event) {
  await requireRole('operator');
  const { openid, startDay, endDay, keyword, page = 1, pageSize = 30 } = event || {};
  const where = buildWhere({ openid, startDay, endDay, keyword });
  const skip = Math.max(0, (page - 1) * pageSize);
  const countRes = await db.collection(COLL).where(where).count();
  const total = countRes.total || 0;
  const res = await db.collection(COLL)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  const openids = [...new Set(res.data.map((r) => r.openid).filter(Boolean))];
  const uMap = await getUserMap(openids);
  const list = res.data.map((r) => ({
    _id: r._id,
    content: r.content,
    category: r.category || '自定义',
    note: r.note || '',
    keywords: r.keywords || [],
    author: r.author || '',
    intent_key: r.intent_key || '',
    openid: r.openid,
    nickname: pickNickname(uMap[r.openid]),
    avatar: pickAvatar(uMap[r.openid]),
    createdAt: r.createdAt ? new Date(r.createdAt).getTime() : 0,
  }));

  return reply(0, 'ok', { total, page, pageSize, list });
}

// ================================================================
// action: stats
// ================================================================
async function actionStats(event) {
  await requireRole('operator');
  const days = Math.min(Number(event && event.days) || 14, 60);
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  // 全站总数
  const totalRes = await db.collection(COLL).count();
  const total = totalRes.total || 0;

  // 窗口前存量（用于累计总数）
  const baseRes = await db.collection(COLL).where({ createdAt: _.lt(new Date(cutoff)) }).count();
  const base = baseRes.total || 0;

  // 按用户维度聚合（聚合管道，不依赖全量拉取，量级大也准确）
  const agg = await db.collection(COLL)
    .aggregate()
    .group({
      _id: '$openid',
      count: _.aggregate.sum(1),
      lastActive: _.aggregate.max('$createdAt'),
    })
    .sort({ count: -1 })
    .end();

  const rows = agg.list || [];
  const openids = rows.map((r) => r._id).filter(Boolean);
  const uMap = await getUserMap(openids);

  const users = rows.map((r) => ({
    openid: r._id || 'unknown',
    nickname: pickNickname(uMap[r._id]),
    avatar: pickAvatar(uMap[r._id]),
    count: r.count || 0,
    lastActive: r.lastActive ? new Date(r.lastActive).getTime() : 0,
  }));

  // 最近 N 天每日趋势（仅拉时间窗内数据，量级可控）
  const recent = await db.collection(COLL)
    .where({ createdAt: _.gte(new Date(cutoff)) })
    .limit(MAX_LIMIT)
    .get();
  const buckets = {};
  for (const r of recent.data) {
    if (!r.createdAt) continue;
    const t = new Date(r.createdAt).getTime();
    const d = new Date(t);
    const key =
      d.getFullYear() +
      '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const daily = [];
  let running = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key =
      d.getFullYear() +
      '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
    const c = buckets[key] || 0;
    running += c;
    daily.push({ date: key, count: c, total: base + running });
  }

  return reply(0, 'ok', { total, users, daily, days });
}

// ================================================================
// action: remove
// ================================================================
async function actionRemove(event) {
  await requireRole('admin');
  const id = event && event.id;
  if (!id) return err('缺少 id');
  const res = await db.collection(COLL).doc(id).remove();
  return reply(0, 'ok', { removed: (res.stats && res.stats.removed) || 0 });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';
  const handlers = { list: actionList, stats: actionStats, remove: actionRemove };
  const handler = handlers[action];
  if (!handler) return err('未知 action: ' + action, 400);
  try {
    return await handler(event, context);
  } catch (e) {
    const status = e && e.status;
    if (status === 401) return err(e.message || '未登录', 401);
    if (status === 403) return err(e.message || '权限不足', 403);
    return err(e.message || String(e), 500);
  }
};
