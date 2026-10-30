import { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/store/useUserStore';
import UserManagement from './UserManagement';
import {
  ApiBaseManagement,
  AttackCategoryManagement,
  AttackSceneManagement,
  DailyManagement,
  IntentManagement,
  ModelParamsManagement,
  PresetManagement,
  PromptManagement,
  FixedQuoteManagement,
  TopicManagement,
  DailyQuoteManagement,
} from './ConfigSections';
import styles from './index.module.scss';

type TabKey =
  | 'users' | 'intents' | 'fixed' | 'dailyQuotes' | 'topics' | 'model'
  | 'daily' | 'apibase' | 'attack' | 'attackcat' | 'presets' | 'prompts';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'users', label: '用户管理' },
  { key: 'intents', label: '意图管理' },
  { key: 'fixed', label: '固定语录管理' },
  { key: 'dailyQuotes', label: '每日语录管理' },
  { key: 'topics', label: '话题管理' },
  { key: 'model', label: '模型参数' },
  { key: 'daily', label: '每日参数' },
  { key: 'apibase', label: '后端地址' },
  { key: 'attack', label: '出招场景' },
  { key: 'attackcat', label: '出招分类' },
  { key: 'presets', label: 'LLM预设' },
  { key: 'prompts', label: '提示词' },
];

export default function AdminPage() {
  const { user, role } = useUserStore();
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'operator';

  const [tab, setTab] = useState<TabKey>('users');

  useDidShow(() => {
    const r = role();
    if (r === 'user' || !r) {
      Taro.showToast({ title: '无权限访问', icon: 'none' });
      setTimeout(() => Taro.reLaunch({ url: '/pages/defend/index' }), 1000);
    }
  });

  if (!isStaff) {
    return (
      <View className={styles.noAccess}>
        <Text className={styles.noAccessIcon}>🚫</Text>
        <Text className={styles.noAccessTitle}>无权限访问</Text>
        <Text className={styles.noAccessDesc}>
          仅管理员和运营可进入管理后台。<br />
          请联系管理员为你开通权限。
        </Text>
      </View>
    );
  }

  function renderTab() {
    switch (tab) {
      case 'users': return <UserManagement isAdmin={isAdmin} />;
      case 'intents': return <IntentManagement isAdmin={isAdmin} />;
    case 'fixed': return <FixedQuoteManagement isAdmin={isAdmin} />;
    case 'dailyQuotes': return <DailyQuoteManagement isAdmin={isAdmin} />;
    case 'topics': return <TopicManagement isAdmin={isAdmin} />;
      case 'model': return <ModelParamsManagement isAdmin={isAdmin} />;
      case 'daily': return <DailyManagement isAdmin={isAdmin} />;
      case 'apibase': return <ApiBaseManagement isAdmin={isAdmin} />;
      case 'attack': return <AttackSceneManagement isAdmin={isAdmin} />;
      case 'attackcat': return <AttackCategoryManagement isAdmin={isAdmin} />;
      case 'presets': return <PresetManagement isAdmin={isAdmin} />;
      case 'prompts': return <PromptManagement isAdmin={isAdmin} />;
      default: return <UserManagement isAdmin={isAdmin} />;
    }
  }

  return (
    <View className={styles.page}>
      <ScrollView scrollX className={styles.tabBar} showScrollbar={false}>
        {TABS.map((t) => (
          <Text
            key={t.key}
            className={[styles.tab, tab === t.key && styles.tabActive].filter(Boolean).join(' ')}
            onClick={() => setTab(t.key)}
          >{t.label}</Text>
        ))}
      </ScrollView>
      <View className={styles.tabContent}>
        {renderTab()}
      </View>
    </View>
  );
}
