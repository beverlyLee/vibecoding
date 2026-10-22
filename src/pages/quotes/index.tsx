import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Input, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import QuoteCard from '@/components/QuoteCard';
import EmptyState from '@/components/EmptyState';
import { QUOTE_CATEGORIES } from '@/data/quotes';
import type { Quote } from '@/data/quotes';
import { useAppStore } from '@/store/useAppStore';
import { funnelForBrowse } from '@/services/quoteFunnel';
import { ensureDailyQuotes } from '@/services/quoteCache';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

// 语录页：三层漏斗合并展示 + 搜索 + 刷新
export default function QuotesPage() {
  const [category, setCategory] = useState('全部');
  const [searchKw, setSearchKw] = useState('');
  const [allQuotes, setAllQuotes] = useState<Quote[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const setPendingQuote = useAppStore((s) => s.setPendingQuote);

  // 加载三层数据
  const loadQuotes = async () => {
    const merged = await funnelForBrowse(searchKw);
    setAllQuotes(merged);
  };

  // 页面显示时：拉每日库 + 合并
  useDidShow(() => {
    loadQuotes();
    // 后台确保每日缓存（不阻塞）
    ensureDailyQuotes().then(() => {
      loadQuotes(); // 拉完后刷新一次
    });
  });

  // 搜索变化时重新过滤
  useEffect(() => {
    loadQuotes();
  }, [searchKw]);

  // 过滤：分类 + 搜索
  const filteredQuotes = useMemo(() => {
    let list = category === '全部' ? allQuotes : allQuotes.filter((q) => q.category === category);
    // 搜索已在 funnelForBrowse 里做过，这里只做分类过滤
    return list;
  }, [allQuotes, category]);

  // 手动刷新
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

  // 点击语录 → 回填拆招页并自动分析
  const handleUse = (quote: Quote) => {
    console.log('[Quotes] 回填语录:', quote.id);
    setPendingQuote(quote.content);
    Taro.switchTab({ url: '/pages/defend/index' });
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

      {/* 搜索框 */}
      <View className={styles.searchBar}>
        <Input
          className={styles.searchInput}
          placeholder='搜索关键词、场景、语录…'
          value={searchKw}
          onInput={(e) => setSearchKw(e.detail.value)}
          confirmType='search'
        />
        <View
          className={[styles.refreshBtn, refreshing && styles.refreshBtnActive].filter(Boolean).join(' ')}
          onClick={handleRefresh}
        >
          <Text>{refreshing ? '刷新中…' : '🔄 刷新热话'}</Text>
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

      <Text className={styles.countTip}>共 {filteredQuotes.length} 条语录</Text>

      {/* 语录列表 */}
      {filteredQuotes.length > 0 ? (
        filteredQuotes.map((q) => <QuoteCard key={q.id} quote={q} onUse={handleUse} />)
      ) : (
        <View className={styles.emptyList}>
          <EmptyState title='暂无语录' desc='换个关键词或分类看看吧' />
        </View>
      )}
    </View>
  );
}
