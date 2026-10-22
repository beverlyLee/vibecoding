import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  desc?: string;
}

// 空状态占位
export default function EmptyState({ emoji = '🐤', title, desc }: EmptyStateProps) {
  return (
    <View className={styles.wrap}>
      <View className={styles.emojiCircle}>
        <Text className={styles.emoji}>{emoji}</Text>
      </View>
      <Text className={styles.title}>{title}</Text>
      {desc && <Text className={styles.desc}>{desc}</Text>}
    </View>
  );
}
