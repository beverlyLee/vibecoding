import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Input, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import QuoteCard from '@/components/QuoteCard';
import EmptyState from '@/components/EmptyState';
import AddUserQuoteSheet from './AddQuoteSheet';
import { QUOTE_CATEGORIES } from '@/data/quotes';
import type { Quote } from '@/data/quotes';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/store/useUserStore';
import { funnelForBrowse } from '@/services/quoteFunnel';
import { ensureDailyQuotes } from '@/services/quoteCache';
import { invalidateUserQuotes } from '@/services/sceneConfig';
import { useLoginSheet } from '@/hooks/useLoginSheet';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

type Tab = 'all' | 'daily' | 'mine';

const FREE_LIMIT = 3; // 未登录时全部 tab 免费看前 3 条

// 语录页：三层漏斗合并展示 + 搜索 + 刷新 + 「我的语录」管理
export default function QuotesPage() {
  const loginSheet = useLoginSheet();
  const [tab, setTab] = useState<Tab>('all');
  const [category, setCategory] = useState('全部');
  const [searchKw, setSearchKw] = useState('');
  const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const setPendingQuote = useAppStore((s) => s.setPendingQuote);
  const { status, user, requireLogin } = useUserStore();
  const loggedIn = status === 'authenticated' && !!user;

  // 全量加载（固定库 + 每日库 + 用户自建）—— 搜索下放到客户端过滤
  const loadQuotes = async () => {
    const merged = await funnelForBrowse('');
    setAllQuotes(merged);
  };

  // 修复竞态：auth.init 还没跑完（authenticating）时 initUserQuotes 会跳过并缓存空数组，
  // 等登录态就绪后强制刷新一次用户语录
  useEffect(() => {
    if (status === 'authenticated') {
      invalidateUserQuotes();
      loadQuotes();
    }
  }, [status]);

  // 页面显示时刷新
  useDidShow(() => {
    loadQuotes();
    ensureDailyQuotes().then(() => loadQuotes());
  });

  // 客户端过滤：分类 + tab + 搜索词（全字段匹配）
  const filteredQuotes = useMemo(() => {
    let list = allQuotes;
    if (tab === 'daily') {
      list = list.filter((q) => q.source === 'daily');
    } else if (tab === 'mine') {
      list = list.filter((q) => q.source === 'user');
    }
    if (category !== '全部') {
      list = list.filter((q) => q.category === category);
    }
    const kw = searchKw.trim();
    if (kw) {
      list = list.filter((q) =>
        q.content.includes(kw) ||
        q.category.includes(kw) ||
        (q.keywords?.some((k) => k.includes(kw)) ?? false) ||
        (q.note?.includes(kw) ?? false)
      );
    }
    return list;
  }, [allQuotes, tab, category, searchKw]);

  // 未登录时全部 tab 限前 3 条
  const visibleQuotes = loggedIn || tab === 'mine'
    ? filteredQuotes
    : filteredQuotes.slice(0, FREE_LIMIT);
  const hiddenCount = filteredQuotes.length - visibleQuotes.length;
  const locked = (tab === 'all' || tab === 'daily') && !loggedIn && hiddenCount > 0;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const count = await ensureDailyQuotes(true);
      await loadQuotes();
      Taro.showToast({ title: `已刷新，新增 ${count.length} 条`, icon: 'none' });
    } catch (err) {
      Taro.showToast({ title: '刷新失败，请稍后再试', icon: 'none' });
    } finally {
      setRefreshing(false);
    }
  };


  const handleUse = (quote: Quote) => {
    setPendingQuote(quote.content);
    Taro.switchTab({ url: '/pages/defend/index' });
  };

  // 未登录时点「我的」tab 弹登录层
  const handleTabChange = (t: Tab) => {
    if (t === 'mine' && !loggedIn) {
      requireLogin('查看我的语录');
      return;
    }
    setTab(t);
  };

  const handleAddQuote = () => {
    if (!loggedIn) {
      requireLogin('添加我的语录');
      return;
    }
    setEditQuote(null);
    setAddSheetVisible(true);
  };

  const handleEditQuote = (q: Quote) => {
    setEditQuote(q);
    setAddSheetVisible(true);
  };

  const handleDeleteQuote = async (q: Quote) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '删除这条语录？',
        content: '删了就找不回来啦',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      await Taro.cloud.callFunction({
        name: 'user_quotes',
        data: { action: 'remove', id: q.id },
      });
      Taro.showToast({ title: '已删除', icon: 'success' });
      loadQuotes();
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '删除失败', icon: 'none' });
    }
  };

  const handleSaved = (_saved: Quote) => {
    setAddSheetVisible(false);
    setEditQuote(null);
    loadQuotes();
  };

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Image className={styles.duck} src={logoDuck} mode='aspectFit' />
        <View className={styles.heroTexts}>
          <Text className={styles.heroTitle}>现成嘴替</Text>
          <Text className={styles.heroDesc}>看到合适的直接点「拿去练手」，鸭鸭帮你现场拆解</Text>
        </View>
      </View>

      {/* Tab 切换：全部 / 每日语录库 / 我的 */}
      <View className={styles.tabBar}>
        <Text
          className={[styles.tabItem, tab === 'all' && styles.tabItemActive].join(' ')}
          onClick={() => handleTabChange('all')}
        >
          全部语录
        </Text>
        <Text
          className={[styles.tabItem, tab === 'daily' && styles.tabItemActive].join(' ')}
          onClick={() => handleTabChange('daily')}
        >
          每日语录库
        </Text>
        <Text
          className={[styles.tabItem, tab === 'mine' && styles.tabItemActive].join(' ')}
          onClick={() => handleTabChange('mine')}
        >
          ✨ 我的语录
        </Text>
      </View>

      {/* 搜索框 —— 直接输入即搜全字段 */}
      <View className={styles.searchBar}>
        <Input
          className={styles.searchInput}
          placeholder='搜索语录内容、标签、备注…'
          value={searchKw}
          onInput={(e) => setSearchKw(e.detail.value)}
          confirmType='search'
        />
        {searchKw && (
          <Text className={styles.searchClear} onClick={() => setSearchKw('')}>✕</Text>
        )}
        <View
          className={[styles.refreshBtn, refreshing && styles.refreshBtnActive].filter(Boolean).join(' ')}
          onClick={tab !== 'mine' ? handleRefresh : undefined}
        >
          <Text>{tab === 'mine' ? '🔍' : (refreshing ? '刷新中…' : '🔄 刷新热话')}</Text>
        </View>
      </View>

      {/* 分类筛选 */}
      <View className={styles.filterBar}>
        <ScrollView scrollX className={styles.filterScroll} enhanced showScrollbar={false}>
          {QUOTE_CATEGORIES.map((c) => (
            <Text
              key={c}
              className={[styles.chip, category === c && styles.chipActive].filter(Boolean).join(' ')}
              onClick={() => setCategory(c)}
            >
              {c}
            </Text>
          ))}
        </ScrollView>
      </View>

      <Text className={styles.countTip}>
        共 {filteredQuotes.length} 条 {tab === 'mine' ? '我的语录' : tab === 'daily' ? '每日语录' : '语录'}
        {locked && ` · 免费看前 ${FREE_LIMIT} 条`}
      </Text>

      {/* 列表 */}
      {visibleQuotes.length > 0 ? (
        <>
          {visibleQuotes.map((q) => (
            <QuoteCard
              key={q.id}
              quote={q}
              onUse={handleUse}
              onEdit={q.source === 'user' ? handleEditQuote : undefined}
              onDelete={q.source === 'user' ? handleDeleteQuote : undefined}
            />
          ))}
          {locked && (
            <View className={styles.lockedCard} onClick={() => requireLogin('查看更多语录')}>
              <Text className={styles.lockedTitle}>🔒 还有 {hiddenCount} 条语录等你解锁</Text>
              <Text className={styles.lockedDesc}>登录后查看完整语录库，覆盖更多沟通场景</Text>
              <Text className={styles.lockedBtn}>去登录 →</Text>
            </View>
          )}
        </>
      ) : (
        <View className={styles.emptyList}>
          {tab === 'mine' ? (
            loggedIn ? (
              <EmptyState title='还没有语录' desc='点击右下角 ➕ 把你用过的好话术记下来吧' />
            ) : (
              <View className={styles.emptyLoginTip}>
                <Text>登录后可以保存专属语录</Text>
                <Text className={styles.emptyLoginBtn} onClick={() => requireLogin('查看我的语录')}>
                  立即登录
                </Text>
              </View>
            )
          ) : (
            <EmptyState title='暂无语录' desc='换个关键词或分类看看吧' />
          )}
        </View>
      )}

      {/* 添加按钮：登录后才显示 */}
      {loggedIn && (
        <View className={styles.addBtn} onClick={handleAddQuote}>
          <Text>+</Text>
        </View>
      )}

      {/* 弹层：新增 / 编辑 复用同一个 */}
      <AddUserQuoteSheet
        visible={addSheetVisible}
        editingQuote={editQuote}
        onClose={() => { setAddSheetVisible(false); setEditQuote(null); }}
        onSaved={handleSaved}
      />

      {/* 登录弹层（全局事件订阅） */}
      {loginSheet}
    </View>
  );
}
