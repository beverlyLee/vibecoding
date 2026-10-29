// 云函数 get_social_tips —— 前端拉取首页社交小知识
// 随机返回 3 条：优先活跃爬取项（3 天内、非系统），不足 3 用系统兜底(is_system)补齐
// 返回格式与前端 SocialTip 一致：{ id, tag, title, content }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const TTL_DAYS = 3;
const PICK = 3;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toTip(d) {
  return { id: `st_${d._id}`, tag: d.tag, title: d.title, content: d.content };
}

exports.main = async (event, context) => {
  try {
    const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;

    // 1. 活跃爬取项（非系统 + 3 天内）
    const res = await db.collection('social_tips')
      .where({ is_system: _.neq(true), fetched_at: _.gte(cutoff) })
      .limit(100)
      .get();

    let pool = res.data.map(toTip);
    shuffle(pool);
    let picked = pool.slice(0, PICK);

    // 2. 不足 3 条 → 用系统兜底补齐（去重避免重复）
    if (picked.length < PICK) {
      const sysRes = await db.collection('social_tips')
        .where({ is_system: true })
        .limit(100)
        .get();
      const pickedContents = new Set(picked.map((p) => p.content));
      const sysPool = shuffle(sysRes.data.map(toTip))
        .filter((s) => !pickedContents.has(s.content))
        .slice(0, PICK - picked.length);
      picked = picked.concat(sysPool);
    }

    console.log(JSON.stringify({ ts: Date.now(), level: 'info', fn: 'get_social_tips', msg: '返回 ' + picked.length + ' 条' }));
    return { code: 0, message: 'ok', data: picked };
  } catch (e) {
    return { code: 1, message: e.message || '查询失败', data: [] };
  }
};
