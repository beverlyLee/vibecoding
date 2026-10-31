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
  QuoteLibraryManagement,
  TopicManagement,
} from './ConfigSections';
import styles from './index.module.scss';

type TabKey =
  | 'quotes' | 'users' | 'intents' | 'topics' | 'model'
  | 'daily' | 'apibase' | 'attack' | 'attackcat' | 'presets' | 'prompts';

type TabItem =
  | { kind: 'label'; label: string }
  | { kind: 'divider' }
  | { kind: 'tab'; key: TabKey; label: string };

// 语录库管理：固定语录库 / 每日语录库 / 我的语录库 三库合一，内部再分 tab
const TABS: TabItem[] = [
  { kind: 'tab', key: 'quotes', label: '语录库管理' },
  { kind: 'divider' },
  { kind: 'tab', key: 'users', label: '用户管理' },
  { kind: 'tab', key: 'intents', label: '意图管理' },
  { kind: 'tab', key: 'topics', label: '话题管理' },
  { kind: 'tab', key: 'model', label: '模型参数' },
  { kind: 'tab', key: 'daily', label: '每日参数' },
  { kind: 'tab', key: 'apibase', label: '后端地址' },
  { kind: 'tab', key: 'attack', label: '出招场景' },
  { kind: 'tab', key: 'attackcat', label: '出招分类' },
  { kind: 'tab', key: 'presets', label: 'LLM预设' },
  { kind: 'tab', key: 'prompts', label: '提示词' },
];

export default function AdminPage() {
  const { user, role } = useUserStore();
  const isAdmin = user?.role === 'admin';
  const isStaff = isAdmin || user?.role === 'operator';

  const [tab, setTab] = useState<TabKey>('quotes');

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
      case 'quotes': return <QuoteLibraryManagement isAdmin={isAdmin} />;
      case 'users': return <UserManagement isAdmin={isAdmin} />;
      case 'intents': return <IntentManagement isAdmin={isAdmin} />;
    case 'topics': return <TopicManagement isAdmin={isAdmin} />;
      case 'model': return <ModelParamsManagement isAdmin={isAdmin} />;
      case 'daily': return <DailyManagement isAdmin={isAdmin} />;
      case 'apibase': return <ApiBaseManagement isAdmin={isAdmin} />;
      case 'attack': return <AttackSceneManagement isAdmin={isAdmin} />;
      case 'attackcat': return <AttackCategoryManagement isAdmin={isAdmin} />;
      case 'presets': return <PresetManagement isAdmin={isAdmin} />;
      case 'prompts': return <PromptManagement isAdmin={isAdmin} />;
      default: return <QuoteLibraryManagement isAdmin={isAdmin} />;
    }
  }

  return (
    <View className={styles.page}>
      <ScrollView scrollX className={styles.tabBar} showScrollbar={false}>
        {TABS.map((t, i) => {
          if (t.kind === 'label') {
            return (
              <Text key={`lbl_${i}`} className={styles.tabGroup}>{t.label}</Text>
            );
          }
          if (t.kind === 'divider') {
            return (
              <Text key={`div_${i}`} className={styles.tabDivider}>│</Text>
            );
          }
          return (
            <Text
              key={t.key}
              className={[styles.tab, tab === t.key && styles.tabActive].filter(Boolean).join(' ')}
              onClick={() => setTab(t.key)}
            >{t.label}</Text>
          );
        })}
      </ScrollView>
      <View className={styles.tabContent}>
        {renderTab()}
      </View>
    </View>
  );
}
