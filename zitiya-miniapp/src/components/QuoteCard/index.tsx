import React from 'react';
import { View, Text, Button } from '@tarojs/components';
import type { Quote } from '@/data/quotes';
import styles from './index.module.scss';

interface QuoteCardProps {
  quote: Quote;
  onUse: (quote: Quote) => void;
  /** 可选：编辑入口（仅 source==='user' 时传） */
  onEdit?: (quote: Quote) => void;
  /** 可选：删除入口 */
  onDelete?: (quote: Quote) => void;
}

const sourceLabels: Record<string, string> = {
  fixed: '固定规则库',
  daily: '每日语录库',
  ai: 'AI 定制',
  user: '我的语录库'
};

// 语录卡片：内容 + 分类 + 来源 badge（每条都标出来自哪个库）+ 我的语录专属编辑/删除
export default function QuoteCard({ quote, onUse, onEdit, onDelete }: QuoteCardProps) {
  const source = quote.source || 'fixed';
  const isUserQuote = source === 'user';

  return (
    <View className={styles.card}>
      <View className={styles.topRow}>
        <Text className={styles.category}>{quote.category}</Text>
        <Text className={[styles.sourceBadge, styles[`source_${source}`]].join(' ')}>
          {sourceLabels[source]}
        </Text>
      </View>
      <Text className={styles.content}>“{quote.content}”</Text>

      {/* 关键词标签组 */}
      {quote.keywords && quote.keywords.length > 0 && (
        <View className={styles.keywordRow}>
          {quote.keywords.map((kw) => (
            <Text key={kw} className={styles.keywordChip}>#{kw}</Text>
          ))}
        </View>
      )}

      <View className={styles.bottomRow}>
        <Text className={styles.note}>{quote.note}</Text>
        <View className={styles.actionGroup}>
          {isUserQuote && onEdit && (
            <Text className={styles.editBtn} onClick={() => onEdit(quote)}>✏️ 编辑</Text>
          )}
          {isUserQuote && onDelete && (
            <Text className={styles.deleteBtn} onClick={() => onDelete(quote)}>🗑</Text>
          )}
          <Button className={styles.useBtn} onClick={() => onUse(quote)}>
            拿去练手
          </Button>
        </View>
      </View>
    </View>
  );
}
