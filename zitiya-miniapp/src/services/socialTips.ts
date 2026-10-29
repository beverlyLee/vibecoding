// 社交小知识服务：从云函数 get_social_tips 拉取首页展示的 3 条
// weapp：走云函数（动态、随机、含系统兜底）
// H5 / 其他：无后端端点，直接用静态兜底 FALLBACK_TIPS

import Taro from '@tarojs/taro';

export interface SocialTip {
  tag: string;
  title: string;
  content: string;
}

// 系统兜底（与云库 seed_social_tips 同源；H5 或云函数异常时静态兜底，保证首页永远有内容）
export const FALLBACK_TIPS: SocialTip[] = [
  {
    tag: '情绪接住',
    title: '先接情绪，再讲道理',
    content: '对方发火时别急着反驳，先共情一句："我能感受到你现在挺急的"，情绪松了，沟通才听得进去。',
  },
  {
    tag: '高情商拒绝',
    title: '不想帮忙？先共情再明确',
    content: '"我理解你需要人搭把手，但这次我时间实在排不开，抱歉啦"——不装忙，不生硬，给双方都留面子。',
  },
  {
    tag: '夸人公式',
    title: '具体 + 感受，胜过"你真好"',
    content: '不说"你真好看"，说"今天这条裙子颜色特别衬你，显得气色好好"。夸到实处，对方才当真。',
  },
];

export async function fetchSocialTips(): Promise<SocialTip[]> {
  // 微信小程序环境：走云函数（零成本、免备案、动态后端）
  if (process.env.TARO_ENV === 'weapp') {
    try {
      const res: any = await Taro.cloud.callFunction({
        name: 'get_social_tips',
        data: {},
      });
      const rows: any[] = res?.result?.data || [];
      if (rows.length > 0) {
        const tips: SocialTip[] = rows.map((r: any) => ({
          tag: r.tag,
          title: r.title,
          content: r.content,
        }));
        console.log('[SocialTips] 云函数返回', tips.length, '条');
        return tips;
      }
      console.log('[SocialTips] 云函数返回 0 条，用兜底');
      return FALLBACK_TIPS;
    } catch (err) {
      console.warn('[SocialTips] 云函数调用失败，用兜底:', err instanceof Error ? err.message : err);
      return FALLBACK_TIPS;
    }
  }

  // H5 / 其他环境：无后端端点，直接用静态兜底
  return FALLBACK_TIPS;
}
