// 云函数 admin_users —— 嘴替鸭用户管理（仅 operator + 可调用）
//
// 聚合 action 路由：
//   list          用户列表（operator 仅可见公开字段；admin 额外可见 role）
//   stats         统计面板（operator +）
//   setStatus     封禁 / 解封（admin）
//   delete        删除用户（admin）
//   setRole       角色变更 user ↔ operator ↔ admin（admin）
//
// 鉴权：所有 action 入口统一用 requireRole() 校验，内部通过 getWXContext().OPENID
//       查 users 集合拿角色，客户端无法伪造。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const USERS = 'users';

// role 权限链：admin > operator > user
const ROLE_LEVEL = { admin: 3, operator: 2, user: 1 };

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
  const res = await db.collection(USERS).where({ openid }).limit(1).get();
  return res.data[0] || null;
}

/** 角色鉴权：要求当前用户角色 ≥ required */
async function requireRole(required, { openid } = {}) {
  const wx = wxContext();
  const callerOpenid = openid || wx.OPENID;
  const caller = await findByOpenid(callerOpenid);
  if (!caller) {
    throw Object.assign(new Error('账号不存在'), { status: 401 });
  }
  if (caller.status === 'banned') {
    throw Object.assign(new Error('账号已被封禁'), { status: 403 });
  }
  const reqLevel = ROLE_LEVEL[required] || 0;
  const curLevel = ROLE_LEVEL[caller.role] || 0;
  if (curLevel < reqLevel) {
    throw Object.assign(new Error('权限不足，需要 ' + required), { status: 403 });
  }
  return caller;
}

/** 用户列表项：operator 隐藏 role 列（避免普通用户自己调此函数拿到角色信息） */
function listItem(user, callerRole) {
  const item = {
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    status: user.status,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    loginCount: user.loginCount || 0,
  };
  if (callerRole === 'admin') {
    item.role = user.role;
  }
  return item;
}

// ================================================================
// action: list
// ================================================================
async function actionList(event) {
  const caller = await requireRole('operator');
  const {
    page = 1,
    pageSize = 20,
    keyword = '',
    status = '',   // 'active' | 'banned' | ''
    role = '',     // 仅 admin 可用
  } = event || {};

  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(50, Math.max(1, Number(pageSize) || 20));

  const where = {};
  if (status === 'active' || status === 'banned') {
    where.status = status;
  }
  // 仅 admin 能按 role 过滤（operator 也看不到 role 列）
  if (role && caller.role === 'admin' && ROLE_LEVEL[role]) {
    where.role = role;
  }
  if (keyword && typeof keyword === 'string') {
    // 昵称模糊匹配
    where.nickname = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
  }

  const totalRes = await db.collection(USERS).where(where).count();
  const total = totalRes.total;

  // 按注册时间倒序，分页
  const listRes = await db.collection(USERS)
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * ps)
    .limit(ps)
    .get();

  return reply(0, 'ok', {
    total,
    page: p,
    pageSize: ps,
    items: listRes.data.map((u) => listItem(u, caller.role)),
  });
}

// ================================================================
// action: stats
// ================================================================
async function actionStats(event) {
  await requireRole('operator');

  const [totalRes, activeRes, bannedRes, adminRes, operatorRes, userRes] = await Promise.all([
    db.collection(USERS).count(),
    db.collection(USERS).where({ status: 'active' }).count(),
    db.collection(USERS).where({ status: 'banned' }).count(),
    db.collection(USERS).where({ role: 'admin' }).count(),
    db.collection(USERS).where({ role: 'operator' }).count(),
    db.collection(USERS).where({ role: 'user' }).count(),
  ]);

  // 今日新增：createdAt 在今天 00:00 之后
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayRes = await db.collection(USERS)
    .where({ createdAt: _.gte(start) })
    .count();

  return reply(0, 'ok', {
    total: totalRes.total,
    active: activeRes.total,
    banned: bannedRes.total,
    todayNew: todayRes.total,
    byRole: {
      admin: adminRes.total,
      operator: operatorRes.total,
      user: userRes.total,
    },
  });
}

// ================================================================
// action: setStatus
// ================================================================
async function actionSetStatus(event) {
  const caller = await requireRole('admin');
  const { openid, status } = event || {};

  if (!openid) return err('缺少 openid');
  if (!['active', 'banned'].includes(status)) return err('无效 status');

  const target = await findByOpenid(openid);
  if (!target) return err('用户不存在', 404);

  // 不能对自己封禁（防止 admin 误操作把自己封了，失去后台）
  if (target.openid === caller.openid) {
    return err('不能对自己执行此操作');
  }

  await db.collection(USERS).doc(target._id).update({
    data: { status, lastLoginAt: db.serverDate() },
  });

  console.log(`[admin_users.setStatus] ${caller.openid} ${status === 'banned' ? '封禁' : '解封'} ${openid}`);

  return reply(0, 'ok', { openid, status });
}

// ================================================================
// action: delete
// ================================================================
async function actionDelete(event) {
  const caller = await requireRole('admin');
  const { openid } = event || {};

  if (!openid) return err('缺少 openid');

  const target = await findByOpenid(openid);
  if (!target) return err('用户不存在', 404);

  // 不能删自己
  if (target.openid === caller.openid) {
    return err('不能删除自己的账号');
  }
  // 不能删最后一个 admin
  if (target.role === 'admin') {
    const adminCount = (await db.collection(USERS).where({ role: 'admin' }).count()).total;
    if (adminCount <= 1) {
      return err('不能删除最后一个管理员');
    }
  }

  await db.collection(USERS).doc(target._id).remove();
  console.log(`[admin_users.delete] ${caller.openid} 删除 ${openid} (role=${target.role})`);

  return reply(0, 'ok', { openid });
}

// ================================================================
// action: setRole
// ================================================================
async function actionSetRole(event) {
  const caller = await requireRole('admin');
  const { openid, role } = event || {};

  if (!openid) return err('缺少 openid');
  if (!['user', 'operator', 'admin'].includes(role)) return err('无效 role');

  const target = await findByOpenid(openid);
  if (!target) return err('用户不存在', 404);

  // 不能操作自己（admin 不能把自己降成 operator/user，避免失去权限）
  if (target.openid === caller.openid) {
    return err('不能修改自己的角色');
  }

  // admin 数量不能为 0（降级成 admin → operator/user 或删除 admin 前先确认）
  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = (await db.collection(USERS).where({ role: 'admin' }).count()).total;
    if (adminCount <= 1) {
      return err('不能降级最后一个管理员');
    }
  }

  await db.collection(USERS).doc(target._id).update({
    data: { role },
  });

  console.log(`[admin_users.setRole] ${caller.openid} 把 ${openid} (原 role=${target.role}) → ${role}`);

  return reply(0, 'ok', { openid, role });
}

// ================================================================
// 主入口
// ================================================================
exports.main = async (event, context) => {
  const action = (event && event.action) || '';

  const handlers = {
    list: actionList,
    stats: actionStats,
    setStatus: actionSetStatus,
    delete: actionDelete,
    setRole: actionSetRole,
  };

  const handler = handlers[action];
  if (!handler) {
    return err(`未知 action: ${action}`, 400);
  }

  try {
    return await handler(event, context);
  } catch (e) {
    console.error(`[admin_users.${action}] 异常:`, e);
    const status = e && e.status;
    if (status === 401) return err(e.message || '未登录', 401);
    if (status === 403) return err(e.message || '权限不足', 403);
    if (status === 404) return err(e.message || '未找到', 404);
    return err(e.message || String(e), 500);
  }
};
