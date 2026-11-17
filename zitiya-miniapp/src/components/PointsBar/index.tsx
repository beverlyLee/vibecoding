// 积分徽章：金币图标 + 签到状态徽章 + 气泡提示
// 点击 → 跳转签到日历页面（pages/checkin）
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useEffect } from 'react';
import { useUserStore } from '@/store/useUserStore';
import styles from './index.module.scss';

export default function PointsBar() {
  const { status, user, isMember } = useUserStore();
  const [showBubble, setShowBubble] = useState(false);

  // ⚠️ 所有 Hook 必须在任何 early return 之前调用
  const hasChecked = !!user?.has_checked_today;
  useEffect(() => {
    if (!hasChecked) {
      setShowBubble(true);
      const t = setTimeout(() => setShowBubble(false), 3500);
      return () => clearTimeout(t);
    } else {
      setShowBubble(false);
    }
  }, [hasChecked]);

  if (status !== 'authenticated' || !user) return null;

  const points = user.points ?? 0;
  const member = isMember();

  const handleTap = () => {
    Taro.navigateTo({ url: '/pages/checkin/index' });
  };

  return (
    <View className={styles.bar} onClick={handleTap}>
      {/* 未签到气泡提示 */}
      {showBubble && !hasChecked && (
        <View className={styles.bubble}>
          <Text className={styles.bubbleText}>今日还未签到，每日签到可领取积分哦</Text>
          <View className={styles.bubbleArrow} />
        </View>
      )}

      {member && <Text className={styles.memberTag}>🎖️</Text>}
      <Text className={styles.pointsIcon}>🪙</Text>
      <Text className={styles.pointsNum}>{points}</Text>

      <View className={[styles.statusTag, hasChecked ? styles.statusChecked : styles.statusUnchecked].join(' ')}>
        <Text className={styles.statusText}>{hasChecked ? '已签到' : '签到'}</Text>
      </View>
    </View>
  );
}
