import React from 'react';
import { View, Text, Button } from '@tarojs/components';
import type { Quote } from '@/data/quotes';
import styles from './index.module.scss';

interface QuoteCardProps {
  quote: Quote;
  onUse: (quote: Quote) => void;
}

const sourceLabels: Record<string, string> = {
  fixed: '本地',
  daily: '社区热话',
  ai: 'AI 定制'
};

// 语录卡片：内容 + 分类 + 来源 badge + 回填分析
export default function QuoteCard({ quote, onUse }: QuoteCardProps) {
  const source = quote.source || 'fixed';
  const showBadge = source !== 'fixed';

  return (
    <View className={styles.card}>
      <View className={styles.topRow}>
        <Text className={styles.category}>{quote.category}</Text>
        {showBadge && (
          <Text className={[styles.sourceBadge, styles[`source_${source}`]].join(' ')}>
            {sourceLabels[source]}
          </Text>
        )}
      </View>
      <Text className={styles.content}>“{quote.content}”</Text>
      <View className={styles.bottomRow}>
        <Text className={styles.note}>{quote.note}</Text>
        <Button className={styles.useBtn} onClick={() => onUse(quote)}>
          拿去练手
        </Button>
      </View>
    </View>
  );
}
