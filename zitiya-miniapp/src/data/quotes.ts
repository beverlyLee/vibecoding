// 语录库三层漏斗：固定规则库（Layer 1）+ 每日拉取库 + LLM 实时生成

// Quote 来源层级
export type QuoteSource = 'fixed' | 'daily' | 'ai' | 'user';

export interface Quote {
  id: string;
  content: string;
  category: string;
  note: string;
  // === 新增可选字段 ===
  source?: QuoteSource;          // 来源层级
  keywords?: string[];           // 关键词/标签，用于漏斗匹配
  author?: string;               // 作者
  fetched_at?: number;           // 拉取时间戳
  intent_key?: string;           // 匹配到的意图 key
  score?: number;                // 匹配分数（漏斗查询时动态填入）
}

export const QUOTE_CATEGORIES = [
  '全部',
  '催婚反击',
  '职场应对',
  '边界感',
  '幽默化解',
  '高情商接话',
  '社区热话',
  'AI 定制'
];

// ===== 固定规则库（Layer 1）=====

export const QUOTES: Quote[] = [
  {
    id: 'q_fixed_1',
    content: '我什么时候结婚，取决于我什么时候遇到对的人，而不是别人什么时候着急。',
    category: '催婚反击',
    note: '用于应对长辈催婚，态度坚定不伤人',
    source: 'fixed',
    keywords: ['结婚', '找对象', '催婚']
  },
  {
    id: 'q_fixed_2',
    content: '您的关心我收到了，但我的日子我自己过，甜苦都算我的。',
    category: '催婚反击',
    note: '先接关心，再拿回人生主导权',
    source: 'fixed',
    keywords: ['催婚', '关心', '结婚']
  },
  {
    id: 'q_fixed_3',
    content: '相亲就像抽奖，我目前还没中奖，但也不想随便买一张凑合刮。',
    category: '催婚反击',
    note: '比喻式回应，把催婚话题变轻松',
    source: 'fixed',
    keywords: ['相亲', '结婚', '找对象']
  },
  {
    id: 'q_fixed_4',
    content: '加班可以，那我们聊聊加班费和调休是怎么算的？',
    category: '职场应对',
    note: '面对无偿加班要求，直接对齐规则',
    source: 'fixed',
    keywords: ['加班', '加班费', '调休']
  },
  {
    id: 'q_fixed_5',
    content: '领导，我的工作量您是知道的，新增这个任务，您希望我先放下哪一个？',
    category: '职场应对',
    note: '用选择题回应压活，让领导自己权衡',
    source: 'fixed',
    keywords: ['工作量', '加班', '任务']
  },
  {
    id: 'q_fixed_6',
    content: '公司培养我，我也在为公司创造价值，这是双向奔赴，不是单方面欠债。',
    category: '职场应对',
    note: '反驳"公司培养你所以你要感恩"式PUA',
    source: 'fixed',
    keywords: ['培养', '感恩', 'PUA', '公司']
  },
  {
    id: 'q_fixed_7',
    content: '有具体问题我们说具体问题，请不要上升到对我这个人的否定。',
    category: '职场应对',
    note: '遭遇人身打压时，把对话拉回事实层面',
    source: 'fixed',
    keywords: ['能力', '不行', '太差', '否定']
  },
  {
    id: 'q_fixed_8',
    content: '这个话题我不太方便聊，咱们换个话题吧。',
    category: '边界感',
    note: '万能挡箭牌，应对收入、感情等隐私打探',
    source: 'fixed',
    keywords: ['工资', '隐私', '换话题']
  },
  {
    id: 'q_fixed_9',
    content: '谢谢你的建议，但这件事我更想自己做决定，做错了也算我的成长。',
    category: '边界感',
    note: '温和拒绝越界指挥',
    source: 'fixed',
    keywords: ['为你好', '决定', '建议']
  },
  {
    id: 'q_fixed_10',
    content: '我理解你的好意，但每个人的活法不一样，我按我的来。',
    category: '边界感',
    note: '应对"为你好"式绑架的经典结构',
    source: 'fixed',
    keywords: ['为你好', '每个人', '自己的事']
  },
  {
    id: 'q_fixed_11',
    content: '帮不上这个忙，真不好意思——但我可以帮你看看别的办法。',
    category: '边界感',
    note: '拒绝帮忙时补一条替代路径，情面两全',
    source: 'fixed',
    keywords: ['借钱', '帮忙', '拒绝']
  },
  {
    id: 'q_fixed_12',
    content: '这个玩笑我不觉得好笑，下次咱们换个乐子。',
    category: '幽默化解',
    note: '应对外貌、单身等越界玩笑，点到为止',
    source: 'fixed',
    keywords: ['开玩笑', '玩笑', '胖', '丑']
  },
  {
    id: 'q_fixed_13',
    content: '我酒量不行，但心意管够——我以茶代酒，您随意。',
    category: '幽默化解',
    note: '酒桌挡酒专用，礼数到位理由充分',
    source: 'fixed',
    keywords: ['喝酒', '劝酒', '酒量']
  },
  {
    id: 'q_fixed_14',
    content: '我这人记性不好，但谁对我好我记得特别清楚。',
    category: '幽默化解',
    note: '四两拨千斤，暗示对方别得寸进尺',
    source: 'fixed',
    keywords: ['记性', '谁对我好']
  },
  {
    id: 'q_fixed_15',
    content: '哎，这话您说到点子上了，所以我正想听听您的建议？',
    category: '高情商接话',
    note: '把话题抛回给对方，为自己争取思考时间',
    source: 'fixed',
    keywords: ['建议', '想听', '抛回去']
  },
  {
    id: 'q_fixed_16',
    content: '嗯，有道理。不过具体到我的情况，可能还得再看看。',
    category: '高情商接话',
    note: '表面认同实际不接招，万能过渡句',
    source: 'fixed',
    keywords: ['有道理', '具体情况', '再看看']
  },
  {
    id: 'q_fixed_17',
    content: '您这个角度我还真没想过，容我回去消化消化。',
    category: '高情商接话',
    note: '体面收尾，避免被逼着当场表态',
    source: 'fixed',
    keywords: ['没想过', '回去', '消化']
  },
  {
    id: 'q_fixed_18',
    content: '咱们都是一家人，有话直说，但互相体谅才能把话说下去。',
    category: '高情商接话',
    note: '家庭争论中打圆场，为继续沟通留余地',
    source: 'fixed',
    keywords: ['一家人', '体谅', '直说']
  }
];
