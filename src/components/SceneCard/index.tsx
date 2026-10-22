import React, { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import classnames from 'classnames';
import Taro from '@tarojs/taro';
import type { AttackScene } from '@/data/attackScenes';
import { copyText } from '@/services/engine';
import styles from './index.module.scss';

interface SceneCardProps {
  scene: AttackScene;
}

// 出招场景卡：开场话术 + 谈话闭环（可展开）
export default function SceneCard({ scene }: SceneCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      Taro.showToast({ title: '已复制', icon: 'success', duration: 1200 });
    }
  };

  return (
    <View className={styles.card}>
      <View className={styles.header} onClick={() => setExpanded(!expanded)}>
        <View className={styles.headerLeft}>
          <Text className={styles.category}>{scene.category}</Text>
          <Text className={styles.title}>{scene.title}</Text>
          <Text className={styles.desc}>{scene.desc}</Text>
        </View>
        <Text className={classnames(styles.arrow, expanded && styles.arrowExpanded)}>▾</Text>
      </View>

      {expanded && (
        <View className={styles.body}>
          <Text className={styles.sectionLabel}>🎯 开场出招</Text>
          {scene.openings.map((text, i) => (
            <View key={i} className={styles.lineItem}>
              <Text className={styles.lineText}>{text}</Text>
              <Button className={styles.copyBtn} onClick={() => handleCopy(text)}>
                复制
              </Button>
            </View>
          ))}

          <Text className={styles.sectionLabel}>🔁 谈话闭环</Text>
          {scene.followups.map((fu, i) => (
            <View key={i} className={styles.followup}>
              <View className={styles.triggerRow}>
                <Text className={styles.roleTag}>对方</Text>
                <Text className={styles.triggerText}>{fu.trigger}</Text>
              </View>
              <View className={styles.replyRow}>
                <Text className={styles.roleTagMe}>我</Text>
                <Text className={styles.replyText}>{fu.reply}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
