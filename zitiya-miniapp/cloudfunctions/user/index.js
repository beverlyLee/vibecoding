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

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const USERS = 'users';

// ================================================================
// 工具函数
// ================================================================

function reply(code, message, data = null) {
  return { code, message, data };
}

function err(message, code = 1) {
  return reply(code, message, null);
}

function publicFields(row) {
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
  };
}

/** 从云数据库安全计数，避免空集合报错 */
async function safeCount() {
  try {
    const res = await db.collection(USERS).count();
    return res.total || 0;
  } catch (e) {
    // 集合不存在也当作 0
    return 0;
  }
}

/** 按 openid 查用户 */
async function findByOpenid(openid) {
  const res = await db.collection(USERS).where({ openid }).limit(1).get();
  return res.data[0] || null;
}

/** 通用身份获取：从 getWXContext 取 OPENID，校验 */
function getOpenid(context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    throw new Error('无法识别微信身份，请重新进入小程序');
  }
  return openid;
}

// ================================================================
// action: login
// ================================================================
async function actionLogin(event, context) {
  const openid = getOpenid(context);

  // 前端可选择性传入 nickname + avatar，新用户直接用；老用户也同步更新（比如换了个头像）
  const nickname = typeof event?.nickname === 'string' ? event.nickname.trim().slice(0, 32) : '';
  const avatar = typeof event?.avatar === 'string' && event.avatar.length <= 500 ? event.avatar : '';

  const existing = await findByOpenid(openid);
  const now = db.serverDate();

  if (existing) {
    if (existing.status === 'banned') {
      return err('账号已被封禁，请联系管理员', 403);
    }
    // 登录同时更新昵称/头像（如果前端传了）
    const patch = { lastLoginAt: now, loginCount: _.inc(1) };
    if (nickname) patch.nickname = nickname;
    if (avatar) patch.avatar = avatar;
    await db.collection(USERS).doc(existing._id).update({ data: patch });

    const merged = { ...existing, ...patch, lastLoginAt: now, loginCount: (existing.loginCount || 0) + 1 };
    return reply(0, 'ok', publicFields(merged));
  }

  // 新用户：冷启动时（集合为空）自动 admin
  const total = await safeCount();
  const autoAdmin = total === 0;

  const newUser = {
    openid,
    nickname: nickname || '微信用户',
    avatar: avatar || '',
    role: autoAdmin ? 'admin' : 'user',
    status: 'active',
    createdAt: now,
    lastLoginAt: now,
    loginCount: 1,
  };

  const addRes = await db.collection(USERS).add({ data: newUser });
  const saved = { ...newUser, _id: addRes._id };

  console.log(`[user] 新用户 ${openid} 登录，role=${saved.role}${autoAdmin ? '（冷启动自动 admin）' : ''}${nickname ? ` nickname=${nickname}` : ''}${avatar ? ' hasAvatar=true' : ''}`);

  return reply(0, 'ok', publicFields(saved));
}

// ================================================================
// action: me
// ================================================================
async function actionMe(event, context) {
  const openid = getOpenid(context);
  const user = await findByOpenid(openid);

  if (!user) {
    return err('账号不存在，请重新登录', 404);
  }
  if (user.status === 'banned') {
    return err('账号已被封禁', 403);
  }

  return reply(0, 'ok', publicFields(user));
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
  if (typeof avatar === 'string' && avatar.length <= 500) {
    data.avatar = avatar;
  }

  if (Object.keys(data).length === 0) {
    return err('没有需要更新的字段', 400);
  }

  await db.collection(USERS).doc(user._id).update({ data });

  const updated = { ...user, ...data };
  return reply(0, 'ok', publicFields(updated));
}

// ================================================================
// action: deleteAccount
// ================================================================
async function actionDeleteAccount(event, context) {
  const openid = getOpenid(context);
  const user = await findByOpenid(openid);

  if (!user) return err('账号不存在', 404);

  // admin 不能自己删自己
  if (user.role === 'admin') {
    return err('管理员账号不能自行注销，请联系上级管理员', 400);
  }

  await db.collection(USERS).doc(user._id).remove();
  console.log(`[user] 账号已注销: ${openid} role=${user.role}`);

  return reply(0, 'ok', { openid });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || 'login';

  const handlers = {
    login: actionLogin,
    me: actionMe,
    updateProfile: actionUpdateProfile,
    deleteAccount: actionDeleteAccount,
  };

  const handler = handlers[action];
  if (!handler) {
    return err(`未知 action: ${action}`, 400);
  }

  try {
    return await handler(event, context);
  } catch (e) {
    console.error(`[user.${action}] 异常:`, e);
    return err(e.message || String(e), 500);
  }
};
