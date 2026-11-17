// 云函数 user —— 嘴替鸭用户体系
//
// 聚合 action 路由：
//   login          微信一键登录，按 OPENID upsert，返回 { role, status, nickname, avatar }
//   me             获取当前登录用户档案（封禁返回错误）
//   updateProfile  修改昵称 / 头像（只能改自己）
//   deleteAccount  注销账号（真删 users 记录）
//
// 鉴权：所有身份通过 getWXContext().OPENID 获取，绝不接受客户端传入
// 冷启动：users 集合为空时，第一个 login 的用户自动 admin
//
// 积分逻辑：内联，双表 user_points 主表 + points_transactions 流水表
// 主表 _.inc + where 原子更新保证幂等并发安全

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const USERS = 'users';
const MAIN = 'user_points';
const TX = 'points_transactions';
const SCENE_CONFIG = 'scene_config';

// ================================================================
// 工具函数
// ================================================================

function reply(code, message, data = null) { return { code, message, data }; }
function err(message, code = 1) { return reply(code, message, null); }
function todayStr() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

async function safeCount() { try { return (await db.collection(USERS).count()).total || 0; } catch (e) { return 0; } }
async function findByOpenid(openid) { const res = await db.collection(USERS).where({ openid }).limit(1).get(); return res.data[0] || null; }
function getOpenid(context) { const openid = cloud.getWXContext().OPENID; if (!openid) throw new Error('无法识别微信身份'); return openid; }

// ================================================================
// 积分代理（所有积分逻辑在 user_points 云函数，这里只调它）
// ================================================================
async function callPoints(action, data) {
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  try {
    const payload = { action, openid, ...(data || {}) };
    console.log(`[user.points] → 调用 user_points.${action} openid=${openid}`);
    const res = await cloud.callFunction({ name: 'user_points', data: payload });
    console.log(`[user.points] ← user_points.${action} 结果:`, JSON.stringify(res.result));
    return res.result;
  } catch (e) {
    console.error(`[user.points] ✘ 调用 user_points.${action} 异常:`, e && e.message);
    return { code: 500, message: e && e.message };
  }
}
async function callPointsRefresh() { const r = await callPoints('refresh'); return r && r.code === 0 ? r.data : { points: 0 }; }
async function callPointsQuery()  { const r = await callPoints('query');  return r && r.code === 0 ? r.data : { points: 0 }; }


// ================================================================
// publicFields
// ================================================================

function publicFields(row, pi) {
  if (!row) return null;
  return {
    _id: row._id,
    openid: row.openid,
    nickname: row.nickname,
    avatar: row.avatar,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    loginCount: row.loginCount || 0,
    member_expire: row.member_expire || null,
    points: pi?.points ?? 0,
    has_checked_today: pi?.has_checked_today ?? false,
    daily_checkin_reward: pi?.daily_checkin_reward ?? pi?.daily_add ?? 5,
  };
}

// ================================================================
// action: login
// ================================================================
async function actionLogin(event, context) {
  const openid = getOpenid(context);
  const nickname = typeof event?.nickname === 'string' ? event.nickname.trim().slice(0, 32) : '';
  const avatar = typeof event?.avatar === 'string' && event.avatar.length <= 500 ? event.avatar : '';
  const existing = await findByOpenid(openid);
  const now = db.serverDate();

  if (existing) {
    if (existing.status === 'banned') return err('账号已被封禁，请联系管理员', 403);

    // ① 更新登录行为（users 表的事）
    const patch = { lastLoginAt: now, loginCount: _.inc(1) };
    if (nickname) patch.nickname = nickname;
    if (avatar) patch.avatar = avatar;
    await db.collection(USERS).doc(existing._id).update({ data: patch });

    // ② 积分交给 user_points 云函数（职责单一）
    const pi = await callPointsRefresh();
    return reply(0, 'ok', publicFields(existing, pi));
  }

  const autoAdmin = (await safeCount()) === 0;
  const newUser = {
    openid, nickname: nickname || '微信用户', avatar: avatar || '',
    role: autoAdmin ? 'admin' : 'user', status: 'active',
    createdAt: now, lastLoginAt: now, loginCount: 1,
  };
  const addRes = await db.collection(USERS).add({ data: newUser });
  const saved = { ...newUser, _id: addRes._id };
  console.log(`[user] 新用户 ${openid} role=${saved.role}${autoAdmin ? '(冷启动 admin)' : ''}`);

  // ① 用户已建好（含 lastLoginAt）  ② 调 user_points 发注册赠（不再自动发每日签到）
  const pi = await callPointsRefresh();
  return reply(0, 'ok', publicFields(saved, pi));
}

// ================================================================
// action: me
// ================================================================
async function actionMe(event, context) {
  const openid = getOpenid(context);
  const user = await findByOpenid(openid);
  if (!user) return err('账号不存在，请重新登录', 404);
  if (user.status === 'banned') return err('账号已被封禁', 403);

  // 积分交给 user_points（query = 只查，不发 daily_login）
  const pi = await callPointsQuery();
  return reply(0, 'ok', publicFields(user, pi));
}

// ================================================================
// action: updateProfile
// ================================================================
async function actionUpdateProfile(event, context) {
  const openid = getOpenid(context);
  const user = await findByOpenid(openid);
  if (!user) return err('账号不存在', 404);
  if (user.status === 'banned') return err('账号已被封禁', 403);

  const { nickname, avatar } = event || {};
  const data = {};
  if (typeof nickname === 'string') {
    const trimmed = nickname.trim().slice(0, 32);
    if (trimmed.length > 0) data.nickname = trimmed;
  }
  if (typeof avatar === 'string' && avatar.length <= 500) data.avatar = avatar;
  if (Object.keys(data).length === 0) return err('没有需要更新的字段', 400);

  await db.collection(USERS).doc(user._id).update({ data });
  return reply(0, 'ok', publicFields({ ...user, ...data }));
}

// ================================================================
// action: deleteAccount
// ================================================================
async function actionDeleteAccount(event, context) {
  const openid = getOpenid(context);
  const user = await findByOpenid(openid);
  if (!user) return err('账号不存在', 404);
  if (user.role === 'admin') return err('管理员账号不能自行注销', 400);

  await db.collection(USERS).doc(user._id).remove();
  try {
    const pRes = await db.collection(USER_POINTS).where({ openid }).limit(1).get();
    if (pRes.data[0] && pRes.data[0]._id) await db.collection(USER_POINTS).doc(pRes.data[0]._id).remove();
  } catch (e) {}
  console.log(`[user] 账号已注销: ${openid}`);
  return reply(0, 'ok', { openid });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || 'login';
  const handlers = { login: actionLogin, me: actionMe, updateProfile: actionUpdateProfile, deleteAccount: actionDeleteAccount };
  const handler = handlers[action];
  if (!handler) return err(`未知 action: ${action}`, 400);
  try {
    return await handler(event, context);
  } catch (e) {
    console.error(`[user.${action}] 异常:`, e);
    return err(e.message || String(e), 500);
  }
};
