import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import SceneCard from '@/components/SceneCard';
import EmptyState from '@/components/EmptyState';
import { getAttackCategories, getAttackScenes } from '@/services/sceneConfig';
import { useUserStore } from '@/store/useUserStore';
import { useLoginSheet } from '@/hooks/useLoginSheet';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

const FREE_LIMIT = 3; // 未登录时免费看前 3 个场景

// 出招页：场景分类筛选 → 开场话术 + 谈话闭环
export default function AttackPage() {
  const [category, setCategory] = useState('全部');
  const { status, user, requireLogin } = useUserStore();
  const loginSheet = useLoginSheet();
  const loggedIn = status === 'authenticated' && !!user;

  const categories = useMemo(() => getAttackCategories(), []);
  const allScenes = useMemo(() => {
    const all = getAttackScenes();
    if (category === '全部') return all;
    return all.filter((s) => s.category === category);
  }, [category]);

  // 未登录时限前 3 条
  const visibleScenes = loggedIn ? allScenes : allScenes.slice(0, FREE_LIMIT);
  const hiddenCount = allScenes.length - visibleScenes.length;
  const locked = !loggedIn && hiddenCount > 0;

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

      <Text className={styles.countTip}>
        共 {allScenes.length} 个场景
        {locked && ` · 免费看前 ${FREE_LIMIT} 个`}
      </Text>

      {/* 场景列表 */}
      {visibleScenes.length > 0 ? (
        <>
          {visibleScenes.map((scene) => <SceneCard key={scene.id} scene={scene} />)}
          {locked && (
            <View className={styles.lockedCard} onClick={() => requireLogin('查看更多出招场景')}>
              <Text className={styles.lockedTitle}>🔒 还有 {hiddenCount} 个场景等你解锁</Text>
              <Text className={styles.lockedDesc}>登录后查看完整出招库，更多主动开口的话术</Text>
              <Text className={styles.lockedBtn}>去登录 →</Text>
            </View>
          )}
        </>
      ) : (
        <View className={styles.emptyList}>
          <EmptyState title="该分类暂无场景" desc="换一个分类看看吧" />
        </View>
      )}

      {loginSheet}
    </View>
  );
}
