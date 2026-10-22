import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import SceneCard from '@/components/SceneCard';
import EmptyState from '@/components/EmptyState';
import { getAttackCategories, getAttackScenes } from '@/services/sceneConfig';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

// 出招页：场景分类筛选 → 开场话术 + 谈话闭环
export default function AttackPage() {
  const [category, setCategory] = useState('全部');

  const categories = useMemo(() => getAttackCategories(), []);
  const scenes = useMemo(() => {
    const all = getAttackScenes();
    if (category === '全部') return all;
    return all.filter((s) => s.category === category);
  }, [category]);

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Image className={styles.duck} src={logoDuck} mode='aspectFit' />
        <View className={styles.heroTexts}>
          <Text className={styles.heroTitle}>场景出招</Text>
          <Text className={styles.heroDesc}>不用等别人先开口，主动出击心里更有底</Text>
        </View>
      </View>

      {/* 分类筛选 */}
      <View className={styles.filterBar}>
        <ScrollView scrollX className={styles.filterScroll} enhanced showScrollbar={false}>
          {categories.map((c) => (
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

      <Text className={styles.countTip}>共 {scenes.length} 个场景</Text>

      {/* 场景列表 */}
      {scenes.length > 0 ? (
        scenes.map((scene) => <SceneCard key={scene.id} scene={scene} />)
      ) : (
        <View className={styles.emptyList}>
          <EmptyState title="该分类暂无场景" desc="换一个分类看看吧" />
        </View>
      )}
    </View>
  );
}
