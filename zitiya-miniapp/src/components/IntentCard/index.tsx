import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import type { AnalysisResult, IntensityLevel } from '@/types/analysis';
import { INTENSITY_META } from '@/types/analysis';
import styles from './index.module.scss';

// 意图 → emoji 映射（模糊匹配关键词，命中多个取第一个，未命中回退 💡）
const INTENT_EMOJI: { kw: string[]; icon: string }[] = [
  { kw: ['试探', '探查', '摸底', '刺探'], icon: '🔍' },
  { kw: ['邀约', '表白', '喜欢', '示好', '撩', '追'], icon: '💬' },
  { kw: ['施压', '催促', '逼迫', '命令', '逼'], icon: '⚠️' },
  { kw: ['抱怨', '吐槽', '发牢骚', '情绪'], icon: '💢' },
  { kw: ['比较', '攀比', '炫耀', '晒'], icon: '📊' },
  { kw: ['质疑', '否定', '挑刺', '反驳'], icon: '❓' },
  { kw: ['夸', '捧', '讨好'], icon: '🌟' },
];
function intentIcon(name: string): string {
  for (const m of INTENT_EMOJI) {
    if (m.kw.some((k) => name.includes(k))) return m.icon;
  }
  return '💡';
}

// 情绪温度计三段（低压 → 高压）
const LEVELS: { key: IntensityLevel; short: string }[] = [
  { key: 'low', short: '平和' },
  { key: 'medium', short: '有点冲' },
  { key: 'high', short: '来势猛' },
];

interface IntentCardProps {
  result: Pick<AnalysisResult, 'intent' | 'intensity' | 'situation' | 'costMs'>;
}

// 意图识别诊断卡：一眼看懂「对方想干嘛 + 来势多大」
export default function IntentCard({ result }: IntentCardProps) {
  const intensity = INTENSITY_META[result.intensity];
  const [showAll, setShowAll] = useState(false);
  const situation = (result.situation || '').trim();
  const hasSituation = situation.length > 0;
  // 长文默认给「一句话摘要」常驻，不再整段藏起来
  const isLong = situation.length > 42;
  const brief = isLong ? `${situation.slice(0, 42)}…` : situation;
  const activeLevel = LEVELS.findIndex((l) => l.key === result.intensity);

  return (
    <View className={styles.card}>
      {/* 顶部：诊断标题 + 强度结论 */}
      <View className={styles.head}>
        <View className={styles.headLeft}>
          <Text className={styles.headIcon}>🕵️</Text>
          <Text className={styles.headTitle}>对方这句，什么来路</Text>
        </View>
        <View className={styles.intensityBadge} style={{ backgroundColor: `${intensity.color}1A` }}>
          <Text className={styles.intensityText} style={{ color: intensity.color }}>
            {intensity.label}
          </Text>
        </View>
      </View>

      {/* 意图 chips */}
      <View className={styles.intentList}>
        {result.intent.length > 0 ? (
          result.intent.map((name, idx) => (
            <View key={`${name}_${idx}`} className={styles.intentChip}>
              <Text className={styles.intentIcon}>{intentIcon(name)}</Text>
              <Text className={styles.intentName}>{name}</Text>
            </View>
          ))
        ) : (
          <View className={styles.intentChip}>
            <Text className={styles.intentIcon}>💬</Text>
            <Text className={styles.intentName}>日常闲聊</Text>
          </View>
        )}
      </View>

      {/* 情绪温度计 */}
      <View className={styles.meter}>
        <Text className={styles.meterLabel}>来势</Text>
        <View className={styles.meterTrack}>
          {LEVELS.map((l, i) => (
            <View
              key={l.key}
              className={styles.meterSeg}
              style={{ backgroundColor: i <= activeLevel ? intensity.color : '#eaeef5' }}
            />
          ))}
        </View>
        <Text className={styles.meterValue} style={{ color: intensity.color }}>
          {LEVELS[activeLevel]?.short || '平和'}
        </Text>
      </View>

      {/* 情境：一句话常驻 + 看全文 */}
      {hasSituation && (
        <View className={styles.situationBox}>
          <View className={styles.situationKicker}>
            <Text className={styles.situationKickerIcon}>💭</Text>
            <Text className={styles.situationKickerText}>鸭鸭帮你翻译一下</Text>
          </View>
          <Text className={styles.situation}>{showAll ? situation : brief}</Text>
          {isLong && (
            <Text className={styles.situationToggle} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '收起 ▴' : '看完整解读 ▾'}
            </Text>
          )}
        </View>
      )}

      <View className={styles.footer}>
        <Text className={styles.costText}>⚡ 用时 {(result.costMs / 1000).toFixed(1)}s</Text>
      </View>
    </View>
  );
}
