import React from 'react';
import { View, Text } from '@tarojs/components';
import type { AnalysisResult } from '@/types/analysis';
import { INTENSITY_META } from '@/types/analysis';
import styles from './index.module.scss';

interface IntentCardProps {
  result: Pick<AnalysisResult, 'intent' | 'intensity' | 'situation' | 'source' | 'costMs'>;
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'llm': return '🧠 大模型分析';
    case 'rule': return '🦆 内置规则';
    case 'fallback': return '🛟 兜底（AI 暂不可用）';
    case 'fallback_no_llm': return '🛟 兜底（未配置大模型）';
    default: return '🦆 内置规则';
  }
}

// 意图识别结果卡
export default function IntentCard({ result }: IntentCardProps) {
  const intensity = INTENSITY_META[result.intensity];
  return (
    <View className={styles.card}>
      <View className={styles.header}>
        <View className={styles.titleWrap}>
          <Text className={styles.titleLabel}>识别意图</Text>
          <View className={styles.intentList}>
            {result.intent.map((name, idx) => (
              <Text
                key={`${name}_${idx}`}
                className={styles.intentTag}
                style={idx > 0 ? { background: 'rgba(0,0,0,0.04)', color: 'inherit' } : undefined}
              >
                {name}
              </Text>
            ))}
          </View>
        </View>
        <View className={styles.badges}>
          <View className={styles.intensityBadge} style={{ backgroundColor: `${intensity.color}1A` }}>
            <View className={styles.dot} style={{ backgroundColor: intensity.color }} />
            <Text className={styles.intensityText} style={{ color: intensity.color }}>
              {intensity.label}
            </Text>
          </View>
        </View>
      </View>
      {result.situation && <Text className={styles.situation}>{result.situation}</Text>}
      <View className={styles.footer}>
        <Text className={styles.sourceText}>
          {sourceLabel(result.source)}
        </Text>
        <Text className={styles.costText}>耗时 {(result.costMs / 1000).toFixed(1)}s</Text>
      </View>
    </View>
  );
}
