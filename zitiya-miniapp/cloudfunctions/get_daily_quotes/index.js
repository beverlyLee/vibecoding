// 云函数 get_daily_quotes —— 前端拉取每日语录
// 从云数据库 daily_quotes 读最近 7 天的，按 fetched_at 倒序
// 也支持按 intent_key 过滤（漏斗 L2 用）

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

exports.main = async (event, context) => {
  const { intent_key, limit = 50 } = event || {};

  try {
    const cutoff = Date.now() - TTL_MS;
    const where = { fetched_at: db.command.gte(cutoff) };
    if (intent_key) where.intent_key = intent_key;

    const res = await db.collection('daily_quotes')
      .where(where)
      .orderBy('fetched_at', 'desc')
      .limit(Math.min(limit, 100))
      .get();

    // 转成前端 Quote 结构
    const quotes = res.data.map((d) => ({
      id: `q_daily_${d._id}`,
      content: d.content,
      category: '社区热话',
      note: `来自微博话题「${d.source_topic || '未知'}」`,
      source: 'daily',
      author: '',
      url: d.url || '',
      keywords: d.keywords || [],
      intent_key: d.intent_key || null,
      fetched_at: d.fetched_at
    }));

    console.log(JSON.stringify({ ts: Date.now(), level: 'info', fn: 'get_daily_quotes', msg: '返回 ' + quotes.length + ' 条' }));
    return {
      code: 0,
      message: 'ok',
      data: quotes
    };
  } catch (e) {
    return {
      code: 1,
      message: e.message || '查询失败',
      data: []
    };
  }
};
