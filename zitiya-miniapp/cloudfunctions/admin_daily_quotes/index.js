// 云函数 admin_daily_quotes —— 管理后台「每日语录库」管理
// 读写云数据库集合 daily_quotes（由 daily_crawler 定时入库的真实热榜/语料池兜底/seed兜底）
// 鉴权复用 admin_config 的 requireRole：operator 可读(list/stats)，admin 可删(remove)
//
// action 路由：
//   list   按时间范围 / 来源 / 平台 / 关键词筛选 + 分页，返回列表与总数
//   stats  最近 N 天按天分组统计每日入库数量（补齐缺失日期，保证连续）
//   remove 删除单条（admin 权限）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'daily_quotes';

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
  if (!caller) throw Object.assign(new Error('账号不存在'), { status: 401 });
  if (caller.status === 'banned') throw Object.assign(new Error('账号已被封禁'), { status: 403 });
  const LEVEL = { admin: 3, operator: 2, user: 1 };
  const reqLevel = LEVEL[required] || 0;
  const curLevel = LEVEL[caller.role] || 0;
  if (curLevel < reqLevel) throw Object.assign(new Error('权限不足，需要 ' + required), { status: 403 });
  return caller;
}

// 组装列表查询条件
function buildWhere({ startDay, endDay, source, platform, keyword }) {
  const where = {};
  if (startDay || endDay) {
    const range = {};
    if (startDay) range.$gte = new Date(startDay + 'T00:00:00').getTime();
    if (endDay) range.$lte = new Date(endDay + 'T23:59:59.999').getTime();
    where.fetched_at = range;
  }
  if (source && source !== 'all') where.source = source;
  if (platform && platform !== 'all') where.platform = platform;
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
  const { startDay, endDay, source, platform, keyword, page = 1, pageSize = 50 } = event || {};
  const where = buildWhere({ startDay, endDay, source, platform, keyword });
  const skip = Math.max(0, (page - 1) * pageSize);
  const countRes = await db.collection(COLLECTION).where(where).count();
  const total = countRes.total || 0;
  const res = await db.collection(COLLECTION).where(where)
    .orderBy('fetched_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();
  return reply(0, 'ok', { total, page, pageSize, list: res.data });
}

// ================================================================
// action: stats
// ================================================================
async function actionStats(event) {
  await requireRole('operator');
  const days = Math.min(Number(event && event.days) || 14, 60);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const res = await db.collection(COLLECTION).where({ fetched_at: _.gte(cutoff) }).limit(1000).get();
  const buckets = {};
  for (const d of res.data) {
    if (!d.fetched_at) continue;
    const dt = new Date(d.fetched_at);
    const key =
      dt.getFullYear() +
      '-' + String(dt.getMonth() + 1).padStart(2, '0') +
      '-' + String(dt.getDate()).padStart(2, '0');
    buckets[key] = (buckets[key] || 0) + 1;
  }
  // 补齐缺失日期，保证连续
  const arr = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000);
    const key =
      dt.getFullYear() +
      '-' + String(dt.getMonth() + 1).padStart(2, '0') +
      '-' + String(dt.getDate()).padStart(2, '0');
    arr.push({ date: key, count: buckets[key] || 0 });
  }
  return reply(0, 'ok', { days, total: res.data.length, daily: arr });
}

// ================================================================
// action: remove
// ================================================================
async function actionRemove(event) {
  await requireRole('admin');
  const id = event && event.id;
  if (!id) return err('缺少 id');
  const res = await db.collection(COLLECTION).doc(id).remove();
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
