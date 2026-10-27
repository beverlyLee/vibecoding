// 一次性种子云函数：把兜底语料灌入 daily_quotes
// 用法：上传后点「测试」运行一次即可（可重复运行，按 content 去重，不会重复插入）
// 上线后日常数据由 daily_crawler 定时补充，此函数可删

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 兜底语料（与 scripts/gen_seed.py 同源，intent_key 用英文 key）
const SEED = [
  ['我妈又催婚，我说您别急，我这婚结得不快，但离得也慢啊。', '年轻人为什么不想结婚', ['结婚', '催婚', '妈'], 'marriage', 3821],
  ['同事说我太拼，我说我不拼，我只是不想月底看余额时候心慌。', '职场人为什么不敢躺平', ['躺平', '加班', '余额'], 'pua_draw', 2910],
  ['领导说年轻人要多历练，我说行，那加班费也按历练的价算吧。', '领导画的饼能信吗', ['领导', '加班费', '历练'], 'pua_draw', 5534],
  ['亲戚问工资多少，我说够花，他说别瞒，我说真够花，他信了但不甘心。', '过年最怕被问收入', ['工资', '收入', '亲戚'], 'privacy', 4412],
  ['朋友借钱说下周还，我做了个周历，数了八遍都没到下周。', '借钱容易要钱难', ['借钱', '朋友', '还钱'], 'borrow', 3367],
  ['有人说你都这岁数了还不急，我说急的事多着呢，轮不到婚姻排第一。', '大龄单身被指指点点', ['岁数', '单身', '急'], 'marriage', 4988],
  ['甲方改了第十八版需求，我说这版挺好，和我初恋一样，认不出但舍不得删。', '甲方奇葩需求合集', ['甲方', '需求', '改稿'], null, 6721],
  ['体检报告比恐怖片还刺激，我看完默默把夜宵换成了枸杞。', '打工人的体检焦虑', ['体检', '熬夜', '健康'], null, 5190],
  ['群里有人发长语音，我假装没看见，这叫成年人的战略性耳聋。', '最烦微信长语音', ['语音', '群聊', '烦'], null, 4023],
  ['有人说为你好，我说谢谢，但我的人生我做主，好也罢歹也罢。', '被为你好绑架怎么办', ['为你好', '绑架', '决定'], 'moral', 3876],
  ['相亲对象问我房车，我说有脑子，他愣了，这叫资产配置不一样。', '相亲中最怕被盘问', ['相亲', '房车', '盘问'], 'privacy', 4611],
  ['老板说要有格局，我说格局有了，钱包还没跟上，建议同步一下。', '老板谈格局不谈钱', ['格局', '老板', '钱'], 'pua_draw', 6088],
  ['闺蜜失恋哭一晚，我说哭够没，够了我请你吃火锅，眼泪配辣锅最解压。', '如何安慰失恋朋友', ['失恋', '闺蜜', '安慰'], null, 3502],
  ['网友说我玻璃心，我说不是，我是陶瓷心，摔了您赔不起那种。', '网络杠精怎么回', ['网友', '玻璃心', '杠精'], 'joke', 4245],
  ['爸妈催二胎，我说您先催我哥，他近，我远，信号不好。', '被催生二胎的尴尬', ['二胎', '催生', '爸妈'], 'marriage', 3766],
  ['同事甩锅给我，我说锅我接了，但锅底的印您也留着，回头对一对。', '职场甩锅如何反制', ['甩锅', '同事', '职场'], 'blame', 5890],
  ['有人说你太敏感，我说不是敏感，是您说的内容刚好戳到我底线。', '被说敏感怎么回', ['敏感', '底线', '戳'], null, 3998],
  ['周末被叫去团建，我说我去，心在，人到的程度看缘分。', '最烦周末团建', ['团建', '周末', '不想去'], null, 4120],
  ['亲戚说读书没用，我说您说得对，所以我才读得多，想看看有没有用到底。', '读书无用论怎么怼', ['读书', '亲戚', '无用'], null, 3677],
  ['有人说稳定最重要，我说稳定是好，但别稳定成不敢动的理由。', '年轻人该不该求稳', ['稳定', '求稳', '不敢动'], null, 4456],
];

exports.main = async () => {
  const contents = SEED.map((s) => s[0]);
  // 查已存在，避免重复插入
  let existing = new Set();
  try {
    const res = await db.collection('daily_quotes')
      .where({ content: _.in(contents) })
      .field({ content: true })
      .limit(1000)
      .get();
    existing = new Set(res.data.map((d) => d.content));
  } catch (e) {
    console.warn('[Seed] 去重查询失败，继续全量插入:', e.message);
  }

  const now = Date.now();
  let inserted = 0;
  let skipped = 0;
  for (const [content, topic, kws, intent, like] of SEED) {
    if (existing.has(content)) { skipped++; continue; }
    // 分散在最近 6 天内，保证落在 get_daily_quotes 的 7 天窗口内
    const ageMs = Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000);
    try {
      await db.collection('daily_quotes').add({
        data: {
          content,
          source: 'seed',
          source_topic: topic,
          keywords: kws,
          intent_key: intent,
          like_count: like,
          rank_score: Math.round(like * 0.6 + kws.length * 0.4),
          fetched_at: now - ageMs
        }
      });
      inserted++;
    } catch (e) {
      console.warn('[Seed] 插入失败:', content.slice(0, 10), e.message);
    }
  }

  return { code: 0, message: 'ok', data: { inserted, skipped, total: SEED.length } };
};
