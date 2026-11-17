// ================================================================
// user_points 云函数 —— 积分唯一真相源
//
// 双表架构:
//   ① user_points     主表（余额快照，快速读，原子幂等更新）
//   ② points_transactions  流水表（审计追溯，每次操作一条）
//
// 写入顺序（模拟事务，主表是真相源）:
//   Step 1: 原子更新主表（_.inc + where 条件，幂等并发安全）
//   Step 2: 插流水（审计，失败不影响主表正确性）
//
// 幂等保证:
//   注册赠:  where(points_initial_bonus != true) → _.inc(initial_bonus) → 设 true
//   每日签到: where(checkin_date != today) → _.inc(daily_checkin) → 设 today
//   扣积分:   where(points >= 1) → _.inc(-1) → 原子防超扣
//
// 规则（scene_config.main.points，后台可配）:
//   initial_bonus: 100    新用户注册赠送（幂等）
//   daily_checkin: 5      每日签到赠送（手动触发，会员自动翻倍）
//
// 签到连续性（可选扩展）:
//   连续签到 N 天可加额外奖励，后续扩展时加 consecutive_rewards 配置即可
// ================================================================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const USERS = 'users';
const MAIN = 'user_points';
const TX = 'points_transactions';
const SCENE_CONFIG = 'scene_config';

// ---------- utils ----------
const reply = (code, message, data) => ({ code, message, data });
const logf = (level, msg) => {
  const tag = `[points.${level}]`;
  level === 'error' ? console.error(tag, msg) : console.log(tag, msg);
};
const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ---------- 读规则 ----------
async function readRules() {
  const r = { initial_bonus: 100, daily_checkin: 5 };
  try {
    const cfg = await db.collection(SCENE_CONFIG).doc('main').get();
    const p = cfg.data && cfg.data.points;
    if (p && typeof p === 'object') {
      if (typeof p.initial_bonus === 'number') r.initial_bonus = p.initial_bonus;
      // 兼容旧字段 daily_default
      if (typeof p.daily_checkin === 'number') r.daily_checkin = p.daily_checkin;
      else if (typeof p.daily_default === 'number') r.daily_checkin = p.daily_default;
    }
  } catch (e) {}
  return r;
}

async function fetchUser(openid) {
  try {
    const res = await db.collection(USERS).where({ openid }).limit(1).get();
    return res.data[0] || null;
  } catch (e) { return null; }
}

function computeCheckinReward(user, rules) {
  const isMember = user && user.member_expire && user.member_expire > todayStr();
  return isMember ? rules.daily_checkin * 2 : rules.daily_checkin;
}

// ---------- 主表操作 ----------

/** 确保主表有一条记录（不存在就建空的） */
async function ensureMain(openid) {
  try {
    const res = await db.collection(MAIN).where({ openid }).limit(1).get();
    const r = res.data[0];
    if (r) return r;
  } catch (e) {}
  const rec = {
    openid,
    points: 0,
    checkin_date: '',            // 签到日期（YYYY-MM-DD），空=未签到
    points_initial_bonus: false,
    points_total: 0,
    updatedAt: db.serverDate(),
  };
  try {
    const addRes = await db.collection(MAIN).add({ data: rec });
    logf('info', `新建 user_points 主表 openid=${openid}`);
    return { ...rec, _id: addRes._id };
  } catch (e) {
    logf('error', `新建主表失败: ${e && e.message}`);
    return rec;
  }
}

/** 读最新余额 + 签到状态 */
async function readBalanceWithCheckin(openid) {
  const r = await ensureMain(openid);
  const today = todayStr();
  return {
    points: r.points || 0,
    checkin_date: r.checkin_date || '',
    has_checked_today: (r.checkin_date || '') === today,
  };
}

// ---------- 流水表操作 ----------

async function addTx(openid, delta, reason, expireAt) {
  if (!delta) return;
  try {
    await db.collection(TX).add({
      data: { openid, delta, reason, expireAt: expireAt || null, createdAt: db.serverDate() },
    });
  } catch (e) {
    logf('error', `插流水失败: ${e && e.message}（主表已更新，流水可稍后补偿）`);
  }
}

// ---------- 核心原子操作（主表 _.inc + where，并发安全） ----------

/**
 * 确保注册赠已发放（幂等）
 * login / deduct / checkin 入口都会调，保证新用户有初始积分
 */
async function atomicEnsureBonus(openid) {
  const rules = await readRules();
  await ensureMain(openid);
  const bonus = rules.initial_bonus || 100;
  try {
    const r = await db.collection(MAIN).where({ openid, points_initial_bonus: _.neq(true) })
      .update({ data: { points: _.inc(bonus), points_initial_bonus: true, updatedAt: db.serverDate() } });
    if (r.stats && r.stats.updated > 0) {
      await addTx(openid, bonus, 'initial_bonus', null);
      logf('info', `注册赠 +${bonus}`);
    }
  } catch (e) { logf('error', `注册赠失败: ${e && e.message}`); }
}

/**
 * 原子签到（手动触发，每日一次）
 * 幂等保证: where(checkin_date != today) → 命中才给积分
 *
 * 返回:
 *   { ok: true, reward, balance, isMember }  —— 签到成功
 *   { ok: false, code: 409, message: '今日已签到', balance, has_checked_today: true }
 */
async function atomicCheckin(openid) {
  await atomicEnsureBonus(openid);
  const rules = await readRules();
  const user = await fetchUser(openid);
  const today = todayStr();
  const isMember = user && user.member_expire && user.member_expire > today;
  const reward = isMember ? rules.daily_checkin * 2 : rules.daily_checkin;

  // 原子签到: where checkin_date != today 保证每日一次
  let updated = false;
  try {
    const r = await db.collection(MAIN).where({ openid, checkin_date: _.neq(today) })
      .update({
        data: {
          points: _.inc(reward),
          checkin_date: today,
          updatedAt: db.serverDate(),
        },
      });
    updated = r.stats && r.stats.updated > 0;
  } catch (e) { logf('error', `签到原子更新失败: ${e && e.message}`); }

  if (!updated) {
    // 已签到（或并发被别人先签了）
    const latest = await ensureMain(openid);
    if ((latest.checkin_date || '') === today) {
      return { ok: false, code: 409, message: '今日已签到，明天再来~', balance: latest.points || 0, has_checked_today: true };
    }
    // 并发极端情况：再试一次
    try {
      const r2 = await db.collection(MAIN).where({ openid, checkin_date: _.neq(today) })
        .update({ data: { points: _.inc(reward), checkin_date: today, updatedAt: db.serverDate() } });
      updated = r2.stats && r2.stats.updated > 0;
    } catch (e) { logf('error', `签到重试失败: ${e && e.message}`); }
  }

  if (!updated) {
    return { ok: false, code: 500, message: '签到失败，请重试' };
  }

  await addTx(openid, reward, 'daily_checkin', null);
  const latest = await ensureMain(openid);
  logf('info', `签到 +${reward}${isMember ? ' (会员翻倍)' : ''}, balance=${latest.points}`);
  return { ok: true, reward, balance: latest.points || 0, isMember, has_checked_today: true };
}

/**
 * 原子扣 1 积分（并发安全: where points >= 1）
 */
async function atomicDeduct(openid) {
  await atomicEnsureBonus(openid);
  const rec = await ensureMain(openid);

  if ((rec.points || 0) < 1) {
    return { ok: false, code: 429, message: '积分为空，点击右上角积分徽章每日签到领取' };
  }

  // 原子扣减: where points >= 1 保证不会超扣
  let updated = false;
  try {
    const r = await db.collection(MAIN)
      .where({ openid, points: _.gte(1) })
      .update({
        data: {
          points: _.inc(-1),
          points_total: _.inc(1),
          updatedAt: db.serverDate(),
        },
      });
    updated = r.stats && r.stats.updated > 0;
  } catch (e) { logf('error', `扣积分原子更新失败: ${e && e.message}`); }

  // 并发重试
  if (!updated) {
    const latest = await ensureMain(openid);
    if ((latest.points || 0) < 1) {
      return { ok: false, code: 429, message: '积分为空，点击右上角积分徽章每日签到领取' };
    }
    try {
      await db.collection(MAIN).where({ openid, points: _.gte(1) }).update({
        data: { points: _.inc(-1), points_total: _.inc(1), updatedAt: db.serverDate() },
      });
      updated = true;
    } catch (e) {
      return { ok: false, code: 500, message: '扣积分失败，请重试' };
    }
  }

  await addTx(openid, -1, 'llm_deduct', null);
  const newBalance = (rec.points || 0) - 1;
  logf('info', `扣 1 积分: ${rec.points}→${newBalance}`);
  return { ok: true, balance: newBalance };
}

/** admin 手动调整 */
async function atomicAdminAdjust(openid, delta) {
  if (typeof delta !== 'number' || !isFinite(delta)) return reply(400, 'delta 必须是数字');
  await ensureMain(openid);
  try {
    await db.collection(MAIN).where({ openid }).update({
      data: { points: _.inc(delta), updatedAt: db.serverDate() },
    });
  } catch (e) { return reply(500, `主表更新失败: ${e && e.message}`); }
  await addTx(openid, delta, 'admin_adjust', null);
  const rec = await ensureMain(openid);
  logf('info', `admin_adjust openid=${openid} delta=${delta} → balance=${rec.points}`);
  return reply(0, 'ok', { points: rec.points || 0 });
}

// ---------- Actions ----------

/**
 * refresh: 登录时调 —— 只确保注册赠已发，不再自动送每日积分
 * 返回: { points, is_member, has_checked_today }
 */
async function actionRefresh(openid) {
  await atomicEnsureBonus(openid);
  const info = await readBalanceWithCheckin(openid);
  const user = await fetchUser(openid);
  const isMember = user && user.member_expire && user.member_expire > todayStr();
  const rules = await readRules();
  const reward = isMember ? rules.daily_checkin * 2 : rules.daily_checkin;
  return reply(0, 'ok', {
    points: info.points,
    is_member: !!isMember,
    has_checked_today: info.has_checked_today,
    daily_checkin_reward: reward,
  });
}

/**
 * query: 纯查询积分状态 —— 返回余额 + 今日签到状态 + reward
 */
async function actionQuery(openid) {
  const info = await readBalanceWithCheckin(openid);
  const user = await fetchUser(openid);
  const isMember = user && user.member_expire && user.member_expire > todayStr();
  const rules = await readRules();
  const reward = isMember ? rules.daily_checkin * 2 : rules.daily_checkin;
  return reply(0, 'ok', {
    ...info,
    is_member: !!isMember,
    daily_checkin_reward: reward,
  });
}

/**
 * checkin: 手动签到 —— 每日一次，幂等
 */
async function actionCheckin(openid) {
  const r = await atomicCheckin(openid);
  if (!r.ok) {
    if (r.code === 409) return reply(409, r.message, { points: r.balance, has_checked_today: true });
    return reply(r.code || 500, r.message);
  }
  return reply(0, 'ok', {
    points: r.balance,
    reward: r.reward,
    has_checked_today: true,
    is_member: r.isMember,
  });
}

async function actionDeduct(openid) {
  const r = await atomicDeduct(openid);
  if (!r.ok) return reply(r.code, r.message, { points: r.balance });
  return reply(0, 'ok', { points: r.balance });
}

async function actionListTx(openid, limit) {
  try {
    const res = await db.collection(TX)
      .where({ openid })
      .orderBy('createdAt', 'desc')
      .limit(Math.min(limit || 20, 50))
      .get();
    const info = await readBalanceWithCheckin(openid);
    return reply(0, 'ok', { ...info, items: res.data });
  } catch (e) { return reply(500, e && e.message || '查流水失败'); }
}

// ---------- Admin ----------

async function actionAdminList(openids) {
  if (!Array.isArray(openids) || openids.length === 0) return reply(400, 'openids 不能为空');
  const out = {};
  for (const oid of openids) {
    const info = await readBalanceWithCheckin(oid);
    out[oid] = info;
  }
  return reply(0, 'ok', out);
}

/** admin 批量补注册赠 */
async function actionAdminBulkGrant() {
  let totalUsers = 0;
  const openids = [];
  try {
    const { data } = await db.collection(USERS).limit(1000).get();
    totalUsers = data.length;
    for (const u of data) openids.push(u.openid);
  } catch (e) { return reply(500, `读 users 失败: ${e && e.message}`); }

  let granted = 0;
  for (const oid of openids) {
    try {
      const before = await (await ensureMain(oid)).points || 0;
      await atomicEnsureBonus(oid);
      const after = await (await ensureMain(oid)).points || 0;
      if (after > before) granted++;
    } catch (e) { logf('error', `批量补发失败 openid=${oid}: ${e && e.message}`); }
  }
  logf('info', `批量补发完成: 遍历 ${totalUsers} 用户，新发放 ${granted}`);
  return reply(0, 'ok', { total: totalUsers, granted });
}

// ---------- 入口 ----------
exports.main = async (event) => {
  const ctx = cloud.getWXContext();
  const OPENID = ctx.OPENID;
  const action = event.action;
  // 内部云函数嵌套调用时 OPENID 为空 → 允许通过 event.openid 传入
  const targetOpenid = event.openid || OPENID;

  console.log(`[user_points.main] action=${action} OPENID=${OPENID || '(null)'} event.openid=${event.openid || '(null)'}`);

  if (!targetOpenid && action !== 'admin_adjust' && action !== 'admin_list' && action !== 'admin_bulk_grant') {
    console.warn('[user_points.main] 无 OPENID 也无 event.openid → 返回 401');
    return reply(401, '无身份');
  }

  switch (action) {
    case 'refresh':   return await actionRefresh(targetOpenid);
    case 'query':     return await actionQuery(targetOpenid);
    case 'checkin':   return await actionCheckin(targetOpenid);
    case 'deduct':    return await actionDeduct(targetOpenid);
    case 'list_tx':   return await actionListTx(targetOpenid, event.limit);
    case 'admin_bulk_grant':
      return await actionAdminBulkGrant();
    case 'admin_adjust': {
      if (!OPENID) return reply(401, '无身份');
      const admin = await fetchUser(OPENID);
      if (!admin || (admin.role !== 'admin' && admin.role !== 'operator')) return reply(403, '无权限');
      return await atomicAdminAdjust(event.openid, event.delta);
    }
    case 'admin_list': {
      if (!OPENID) return reply(401, '无身份');
      const admin = await fetchUser(OPENID);
      if (!admin || (admin.role !== 'admin' && admin.role !== 'operator')) return reply(403, '无权限');
      return await actionAdminList(event.openids);
    }
    default: return reply(404, `未知 action: ${action}`);
  }
};
