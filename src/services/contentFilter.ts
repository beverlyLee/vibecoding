// 内容安全审查模块
// 目的：对 LLM 生成和规则内置的回话做最终一道过滤，
// 确保返回给用户的内容符合公序良俗、无暴力极端、符合小程序发布规则。
// 过滤是"拦截即剔除"的策略 —— 命中任何一条禁用模式，整条回话直接丢弃。

import type { Response } from '@/types/analysis';

// 禁用模式条目
interface ForbiddenPattern {
  // 类别（日志用，方便定位是哪类内容命中）
  category:
    | 'violence'       // 暴力威胁
    | 'abuse'          // 辱骂人身攻击
    | 'self_harm'      // 自残自杀
    | 'discrimination' // 歧视
    | 'crime'          // 违法犯罪
    | 'extreme';       // 极端表达
  // 匹配方式：简单字符串包含即可，不做复杂正则 —— 黑名单要"宁杀错不放过"
  // 词本身会被命中：比如"打死你"包含"打"但更关键是"打死" → 用长词覆盖短词
  patterns: string[];
  // 该类别被触发时的日志提示
  note: string;
}

// ============ 禁用模式库 ============
// 维护原则：
//  - 用具体长词优先（避免误杀），比如"弄死" > "弄"
//  - 覆盖常见变体（打死 / 打残 / 砍死 / 废了你）
//  - 不做语义理解，只做字面匹配，足够解决 90% 问题
const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  {
    category: 'violence',
    note: '暴力威胁类',
    patterns: [
      '打死', '打残', '打扁', '砍死', '砍你', '砍他', '弄死', '弄死你', '废了你',
      '干死', '干你', '杀你', '杀他', '宰了你', '灭了你', '活埋', '弄死他',
      '往死里打', '往死里整', '收拾你', '教训你', '揍你', '揍他',
      '打爆', '爆头', '剁', '锤死', '炸死', '烧你',
    ],
  },
  {
    category: 'abuse',
    note: '辱骂人身攻击类',
    patterns: [
      '傻逼', '草泥马', '滚蛋', '滚远点', '滚出去', '白痴', '蠢货', '废物',
      '混蛋', '混账', '狗东西', '王八蛋', '操', '垃圾', '人渣', '畜生',
      '去死', '死去', '见鬼去', '找死', '脑子有病', '有病吧', '神经病',
      '弱智', '低能', '贱人', '婊子', '下流', '畜生',
      '我日你', '我去你', 'fuck', 'shit',
    ],
  },
  {
    category: 'self_harm',
    note: '自残自杀类',
    patterns: [
      '自杀', '跳楼', '割腕', '上吊', '撞墙', '喝农药', '去死一死',
      '不想活', '活不下去', '活腻了', '一死了之',
    ],
  },
  {
    category: 'discrimination',
    note: '歧视类',
    patterns: [
      '种族优越', '劣等民族', '支那', '洋鬼子', '小日本', '高丽棒子',
      '蛮夷', '低等人种', '猪猡', '废物民族',
    ],
  },
  {
    category: 'crime',
    note: '违法犯罪类',
    patterns: [
      '贩毒', '毒品', '制毒', '运毒', '走私', '嫖娼', '卖淫',
      '赌博', '赌场', '博彩', '六合彩', 'p2p诈骗', '刷单诈骗',
    ],
  },
  {
    category: 'extreme',
    note: '极端表达类',
    patterns: [
      '消灭', '种族灭绝', '大屠杀', '血流成河', '同归于尽', '鱼死网破',
      '恐怖袭击', '人肉炸弹',
    ],
  },
];

// 把所有禁用词平铺成一张表（避免每次都嵌套遍历）
const ALL_FORBIDDEN_TERMS: string[] = FORBIDDEN_PATTERNS.flatMap(p => p.patterns);

// 建立 term → category 映射，日志更清晰
const TERM_TO_CATEGORY = new Map<string, ForbiddenPattern>();
for (const rule of FORBIDDEN_PATTERNS) {
  for (const term of rule.patterns) {
    TERM_TO_CATEGORY.set(term, rule);
  }
}

// ============ 审查函数 ============

// 检查单条文本是否命中任何禁用词
export function checkContent(text: string): { ok: true } | { ok: false; term: string; category: string; note: string } {
  for (const term of ALL_FORBIDDEN_TERMS) {
    if (text.includes(term)) {
      const meta = TERM_TO_CATEGORY.get(term);
      return {
        ok: false,
        term,
        category: meta?.category ?? 'unknown',
        note: meta?.note ?? '未知类别',
      };
    }
  }
  return { ok: true };
}

// 批量过滤 response 数组，返回安全的子集
// 同时记录被拦截的数量，方便上层日志
export function filterResponses(responses: Response[]): { safe: Response[]; blocked: number } {
  const safe: Response[] = [];
  let blocked = 0;
  for (const r of responses) {
    const result = checkContent(r.text);
    if (result.ok) {
      safe.push(r);
    } else {
      console.warn(
        `[ContentFilter] 拦截回话: 类别「${result.category}」(${result.note}), 关键词「${result.term}」, 内容: "${r.text.slice(0, 40)}"`
      );
      blocked += 1;
    }
  }
  return { safe, blocked };
}
