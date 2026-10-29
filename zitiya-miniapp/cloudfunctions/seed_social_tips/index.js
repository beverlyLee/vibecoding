// 一次性种子云函数：把 3 条系统兜底社交小知识灌入 social_tips
// 用法：上传后点「测试」运行一次即可（可重复运行，按 title 去重，不会重复插入）
// 上线后日常数据由 social_tips_crawler 定时补充，此函数可删

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 与前端 FALLBACK_TIPS 同源（即首页原本硬编码的 3 条）
const SEED = [
  { tag: '情绪接住', title: '先接情绪，再讲道理', content: '对方发火时别急着反驳，先共情一句："我能感受到你现在挺急的"，情绪松了，沟通才听得进去。' },
  { tag: '高情商拒绝', title: '不想帮忙？先共情再明确', content: '"我理解你需要人搭把手，但这次我时间实在排不开，抱歉啦"——不装忙，不生硬，给双方都留面子。' },
  { tag: '夸人公式', title: '具体 + 感受，胜过"你真好"', content: '不说"你真好看"，说"今天这条裙子颜色特别衬你，显得气色好好"。夸到实处，对方才当真。' },
];

exports.main = async () => {
  const titles = SEED.map((s) => s.title);
  let existing = new Set();
  try {
    const res = await db.collection('social_tips')
      .where({ title: _.in(titles), is_system: true })
      .field({ title: true })
      .limit(100)
      .get();
    existing = new Set(res.data.map((d) => d.title));
  } catch (e) {
    console.warn('[Seed] 去重查询失败，继续全量插入:', e.message);
  }

  let inserted = 0;
  let skipped = 0;
  for (const s of SEED) {
    if (existing.has(s.title)) { skipped++; continue; }
    try {
      await db.collection('social_tips').add({
        data: { ...s, is_system: true, source: 'seed', fetched_at: Date.now() }
      });
      inserted++;
    } catch (e) {
      console.warn('[Seed] 插入失败:', s.title, e.message);
    }
  }

  return { code: 0, message: 'ok', data: { inserted, skipped, total: SEED.length } };
};
