import React, { useState, useEffect } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/store/useUserStore';
import { useAppStore } from '@/store/useAppStore';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';
import { track } from '@/utils/logger';
import { HOME_ICONS } from './homeIcons';
import { fetchSocialTips, FALLBACK_TIPS, type SocialTip } from '@/services/socialTips';

// 根据当前时间给出友好问候
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

interface QuickEntry {
  key: string;
  label: string;
  desc: string;
  url: string;
}

const ENTRIES: QuickEntry[] = [
  { key: 'defend', label: '拆招', desc: '把原话交给我，想好几套回话', url: '/pages/defend/index' },
  { key: 'attack', label: '出招', desc: '主动发起的沟通话术', url: '/pages/attack/index' },
  { key: 'quotes', label: '语录', desc: '日常可用的嘴替金句', url: '/pages/quotes/index' },
  { key: 'profile', label: '我的', desc: '账号与模型配置', url: '/pages/profile/index' },
];

// 社交小知识：每条控制在 100 字内（数据来自云函数 get_social_tips，FALLBACK_TIPS 为兜底，见 socialTips.ts）
// 首页（第一个 tab）：问候 + 快捷入口 + 引擎状态
export default function HomePage() {
  const [greeting, setGreeting] = useState(getGreeting);
  const [tips, setTips] = useState<SocialTip[]>(FALLBACK_TIPS);
  const { status, user } = useUserStore();
  const activeLLM = useAppStore((s) => s.getActiveLLM());

  const isLoggedIn = status === 'authenticated' && !!user;
  const displayName = user?.nickname || '朋友';
  // 统一带昵称的打招呼：登录用真实昵称，未登录用「朋友」
  const titleText = `${greeting}，${displayName}`;

  useEffect(() => {
    track('page_view', { page: 'home' });
  }, []);

  useDidShow(() => {
    setGreeting(getGreeting());
    // 每次进入首页随机拉取最新社交小知识（活跃爬取项 + 系统兜底）
    fetchSocialTips().then(setTips).catch(() => setTips(FALLBACK_TIPS));
  });

  const goEntry = (e: QuickEntry) => {
    track('home_entry_tap', { key: e.key });
    Taro.switchTab({ url: e.url });
  };

  const goProfile = () => Taro.switchTab({ url: '/pages/profile/index' });

  const engineLabel = activeLLM ? `当前引擎：${activeLLM.name}` : '当前引擎：内置规则';

  return (
    <View className={styles.page}>
      {/* Hero 问候：头像与问候语横排 */}
      <View className={styles.hero}>
        <Image className={styles.duck} src={logoDuck} mode='aspectFit' />
        <View className={styles.heroText}>
          <Text className={styles.title}>{titleText}</Text>
          <Text className={styles.subtitle}>好好说话，温柔连接每一次开口 🌟</Text>
        </View>
      </View>

      {/* 快捷入口 */}
      <View className={styles.sectionTitle}>快捷入口</View>
      <View className={styles.grid}>
        {ENTRIES.map((e) => (
          <View key={e.key} className={styles.entryCard} onClick={() => goEntry(e)}>
            <View className={styles.entryIconWrap}>
              <Image className={styles.entryIcon} src={HOME_ICONS[e.key]} mode='aspectFit' />
            </View>
            <Text className={styles.entryLabel}>{e.label}</Text>
            <Text className={styles.entryDesc}>{e.desc}</Text>
          </View>
        ))}
      </View>

      {/* 社交小知识 */}
      <View className={styles.tipsSection}>
        <View className={styles.sectionTitle}>社交小知识</View>
        {tips.map((tip, idx) => (
          <View key={idx} className={styles.tipCard}>
            <Text className={styles.tipTag}>{tip.tag}</Text>
            <Text className={styles.tipTitle}>{tip.title}</Text>
            <Text className={styles.tipContent}>{tip.content}</Text>
          </View>
        ))}
      </View>

      {/* 引擎状态入口 */}
      <View className={styles.enginePill} onClick={goProfile}>
        <Text className={styles.enginePillText}>
          {engineLabel} · 去「我的」可升级 AI 引擎 ›
        </Text>
      </View>

      <Text className={styles.footerTip}>
        鸭鸭只是帮你组织语言，开口前记得结合当下语境哦
      </Text>
    </View>
  );
}
