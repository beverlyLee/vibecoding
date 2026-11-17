import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { Quote } from '@/data/quotes';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

/**
 * 分类视觉元数据：emoji + 分类色 + 浅色底 + 兜底使用提示。
 * 分类是「场景筛选项」，不是来源标识；卡片上一律不显示来自哪个库。
 * tip 是 note 缺失时的兜底（云端 fixed_quotes 旧数据没有 note 字段），
 * 保证鸭鸭提示气泡在任何数据源下都能显示。
 * 语录页的分类 chips 也复用这份，保证卡片与筛选色一致。
 */
export const QUOTE_CATEGORY_META: Record<string, { emoji: string; color: string; tint: string; tip: string }> = {
  '全部': { emoji: '🧩', color: '#3b6cff', tint: '#eef3ff', tip: '挑一句顺眼的，复制就能发' },
  '催婚反击': { emoji: '🥊', color: '#ef466f', tint: '#fff0f4', tip: '长辈又催了？这句接住，主导权还在你手里' },
  '职场应对': { emoji: '💼', color: '#10b981', tint: '#e9f9f3', tip: '工作上的难处，把话说清楚比硬扛有用' },
  '边界感': { emoji: '🧱', color: '#8b5cf6', tint: '#f3edff', tip: '不想答应的事，这样说既不撕破脸也不委屈自己' },
  '幽默化解': { emoji: '😄', color: '#f59e0b', tint: '#fff6e5', tip: '气氛僵的时候，一句玩笑比讲道理管用' },
  '高情商接话': { emoji: '🤝', color: '#3b6cff', tint: '#eef3ff', tip: '不知道怎么接的话，先把球抛回去' },
  '社区热话': { emoji: '🔥', color: '#f97316', tint: '#fff1e8', tip: '网上吵翻的话题，这句能体面收场' },
  'AI 定制': { emoji: '✨', color: '#21c7e0', tint: '#e6f9fc', tip: '这是你自己的话术，随时能改' }
};

const DEFAULT_META = QUOTE_CATEGORY_META['全部'];

interface QuoteCardProps {
  quote: Quote;
  /** 保留：跳转拆招页二次加工的链路代码不删，但改版后卡片不再渲染该入口 */
  onUse?: (quote: Quote) => void;
  /** 可选：编辑入口（仅「我的语录」传） */
  onEdit?: (quote: Quote) => void;
  /** 可选：删除入口 */
  onDelete?: (quote: Quote) => void;
}

// 语录卡：鸭鸭口吻场景提示 → 递话气泡正文 → 一键复制。不显示任何来源库标识。
export default function QuoteCard({ quote, onEdit, onDelete }: QuoteCardProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meta = QUOTE_CATEGORY_META[quote.category] || DEFAULT_META;
  const isUserQuote = (quote.source || 'fixed') === 'user';
  // 云端旧数据可能没有 note：有 note 用原文，没有就用分类兜底，气泡始终显示
  const tipText = (quote.note && quote.note.trim()) || meta.tip;

  // 组件卸载时清掉复制反馈计时器，避免 setState on unmounted
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = () => {
    Taro.setClipboardData({ data: quote.content })
      .then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => {
        Taro.showToast({ title: '复制失败，长按文字试试', icon: 'none' });
      });
  };

  return (
    <View className={styles.card} style={{ borderLeftColor: meta.color }}>
      {/* ① 场景头：分类图标 + 分类名，右上角留白，无任何来源徽章 */}
      <View className={styles.sceneHead}>
        <View className={styles.sceneIcon} style={{ backgroundColor: meta.tint }}>
          <Text className={styles.sceneEmoji}>{meta.emoji}</Text>
        </View>
        <View className={styles.sceneHeadTexts}>
          <Text className={styles.category} style={{ color: meta.color }}>{quote.category}</Text>
          <Text className={styles.sceneSub}>现成嘴替 · 挑一句就用</Text>
        </View>
        {isUserQuote && (onEdit || onDelete) && (
          <View className={styles.ownerActions}>
            {onEdit && (
              <Text className={styles.editBtn} onClick={() => onEdit(quote)}>✏️ 编辑</Text>
            )}
            {onDelete && (
              <Text className={styles.deleteBtn} onClick={() => onDelete(quote)}>🗑</Text>
            )}
          </View>
        )}
      </View>

      {/* ② 鸭鸭口吻提示：note 原文优先，缺 note 时用分类兜底，气泡恒显示 */}
      <View className={styles.tipRow}>
        <Image className={styles.duckAvatar} src={logoDuck} mode='aspectFit' />
        <View className={styles.tipBubble} style={{ backgroundColor: meta.tint }}>
          <View className={styles.tipTail} style={{ backgroundColor: meta.tint }} />
          <Text className={styles.tipLabel} style={{ color: meta.color }}>鸭鸭说 · 这句这么用</Text>
          <Text className={styles.tipText}>{tipText}</Text>
        </View>
      </View>

      {/* ③ 鸭鸭递话气泡：话术正文始终展开，是视觉主角 */}
      <View className={styles.quoteBubble} style={{ borderLeftColor: meta.color }}>
        <View className={styles.bubbleTail} />
        <Text className={styles.content}>{quote.content}</Text>
      </View>

      {/* 关键词：降为次要 */}
      {quote.keywords && quote.keywords.length > 0 && (
        <View className={styles.keywordRow}>
          {quote.keywords.map((kw) => (
            <Text key={kw} className={styles.keywordChip}>#{kw}</Text>
          ))}
        </View>
      )}

      {/* ④ 终点动作：复制这句。复制成功后冒一句鸭鸭反馈，原「拿去练手」入口不渲染 */}
      {copied && (
        <View className={styles.copiedTip} style={{ backgroundColor: meta.tint }}>
          <Text className={styles.copiedTipText} style={{ color: meta.color }}>
            复制好啦，去发吧 🐤
          </Text>
        </View>
      )}
      <Button
        className={[styles.copyBtn, copied && styles.copyBtnDone].filter(Boolean).join(' ')}
        style={{ backgroundColor: meta.color }}
        onClick={handleCopy}
      >
        {copied ? '✓ 已复制，去发吧' : '📋 复制这句'}
      </Button>
    </View>
  );
}
