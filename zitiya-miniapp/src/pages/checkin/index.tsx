import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/store/useUserStore';
import { userCheckin } from '@/services/user';
import styles from './index.module.scss';

interface PointsTx {
  _id: string;
  delta: number;
  reason: string;
  createdAt: { seconds: number } | string;
}

const REASON_LABELS: Record<string, string> = {
  initial_bonus: '注册赠送',
  daily_checkin: '每日签到',
  llm_deduct: 'AI 消耗',
  admin_adjust: '管理员调整',
};

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(v: { seconds: number } | string | undefined) {
  if (!v) return '';
  const d = typeof v === 'string' ? new Date(v) : new Date((v as any).seconds * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function buildCalendar(txs: PointsTx[], days = 30) {
  const checkedSet = new Set<string>();
  for (const tx of txs) {
    if (tx.reason !== 'daily_checkin') continue;
    const d = typeof tx.createdAt === 'string' ? new Date(tx.createdAt) : new Date((tx.createdAt as any).seconds * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    checkedSet.add(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  const out: { date: string; checked: boolean }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const p = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    out.push({ date: key, checked: checkedSet.has(key) });
  }
  return out;
}

function calcConsecutive(calendar: { date: string; checked: boolean }[], todayChecked: boolean) {
  let count = todayChecked ? 1 : 0;
  for (let i = calendar.length - (todayChecked ? 2 : 1); i >= 0; i--) {
    if (calendar[i].checked) count++;
    else break;
  }
  return count;
}

export default function CheckinPage() {
  const { status, user, isMember, refreshPoints } = useUserStore();
  const [checking, setChecking] = useState(false);
  const [txs, setTxs] = useState<PointsTx[]>([]);
  const [showAllSpends, setShowAllSpends] = useState(false);

  const isLoggedIn = status === 'authenticated' && !!user;
  const hasChecked = !!user?.has_checked_today;
  const reward = user?.daily_checkin_reward ?? (isMember() ? 10 : 5);
  const points = user?.points ?? 0;

  const loadTxs = async () => {
    if (!isLoggedIn) return;
    try {
      const res = await Taro.cloud.callFunction({
        name: 'user_points',
        data: { action: 'list_tx', limit: 50 },
      });
      const list = (res?.result?.data?.items || res?.result?.data || []) as PointsTx[];
      setTxs(Array.isArray(list) ? list : []);
    } catch (e) { /* 忽略 */ }
  };

  useDidShow(() => {
    refreshPoints();
    loadTxs();
  });

  const handleCheckin = async () => {
    if (!isLoggedIn) {
      Taro.eventCenter.trigger('zuitiya:loginSheet', { reason: '签到领取积分' });
      return;
    }
    if (hasChecked || checking) return;
    setChecking(true);
    try {
      const r = await userCheckin();
      if (r.already) {
        Taro.showToast({ title: '今日已签到', icon: 'none' });
      } else {
        Taro.showToast({ title: `签到成功 +${r.reward}`, icon: 'success' });
      }
      await refreshPoints();
      await loadTxs();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '签到失败', icon: 'none' });
    } finally {
      setChecking(false);
    }
  };

  const calendar = buildCalendar(txs, 30);
  const consecutive = calcConsecutive(calendar, hasChecked);
  const today = todayStr();

  const spends = txs.filter(t => t.delta < 0);
  const displaySpends = showAllSpends ? spends : spends.slice(0, 3);
  const hasMoreSpends = spends.length > 3;

  const weekGroups: { date: string; checked: boolean; isToday: boolean }[][] = [];
  let currentWeek: { date: string; checked: boolean; isToday: boolean }[] = [];
  for (const c of calendar) {
    currentWeek.push({ ...c, isToday: c.date === today });
    if (currentWeek.length === 7) {
      weekGroups.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weekGroups.push(currentWeek);

  const weekDayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <ScrollView scrollY className={styles.page}>
      {/* 顶部金币卡片 */}
      <View className={styles.headerCard}>
        <Text className={styles.coinIcon}>🪙</Text>
        <View className={styles.pointsRow}>
          <Text className={styles.pointsNum}>{points}</Text>
          <Text className={styles.pointsLabel}>积分</Text>
        </View>
        <View className={styles.rewardInfo}>
          {isMember() && <Text className={styles.memberBadge}>🎖️ 会员翻倍</Text>}
          <Text className={styles.rewardText}>今日签到可领 +{reward}</Text>
        </View>
      </View>

      {/* 连续签到 */}
      <View className={styles.consecutiveCard}>
        <Text className={styles.consecutiveEmoji}>🔥</Text>
        <Text className={styles.consecutiveText}>
          已连续签到 <Text className={styles.consecutiveNum}>{consecutive}</Text> 天
        </Text>
      </View>

      {/* 签到日历（签到按钮在今天那格） */}
      <View className={styles.sectionCard}>
        <View className={styles.sectionHeader}>
          <Text className={styles.sectionTitle}>📅 近 30 天签到</Text>
          <Text className={styles.sectionLegend}>蓝=已签到  灰=未签到</Text>
        </View>

        {/* 星期表头 */}
        <View className={styles.weekHeader}>
          {weekDayLabels.map((l, i) => (
            <Text key={i} className={styles.weekLabel}>{l}</Text>
          ))}
        </View>

        {/* 日历格子 */}
        {weekGroups.map((week, wi) => (
          <View key={wi} className={styles.weekRow}>
            {week.map((d, di) => {
              const dayNum = new Date(d.date).getDate();
              const isCheckinBtn = d.isToday && !hasChecked && !checking;
              const isCheckingBtn = d.isToday && checking;

              const classes = [styles.dayCell];
              if (d.checked) classes.push(styles.dayChecked);
              if (d.isToday) classes.push(styles.dayToday);
              if (isCheckinBtn) classes.push(styles.dayBtn);

              return (
                <View
                  key={di}
                  className={classes.join(' ')}
                  onClick={isCheckinBtn ? handleCheckin : undefined}
                >
                  <Text className={styles.dayNum}>{dayNum}</Text>

                  {isCheckingBtn && (
                    <Text className={styles.dayBtnLabel}>签到中...</Text>
                  )}
                  {isCheckinBtn && (
                    <Text className={styles.dayBtnLabel}>签到</Text>
                  )}
                  {d.isToday && hasChecked && (
                    <Text className={styles.dayCheckLabel}>已签到</Text>
                  )}
                  {d.checked && !d.isToday && (
                    <Text className={styles.dayCheck}>✓</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* 最近消耗（只显示 3 条，点更多看全部） */}
      {spends.length > 0 && (
        <View className={styles.sectionCard}>
          <View className={styles.sectionHeader}>
            <Text className={styles.sectionTitle}>📋 最近消耗</Text>
            {hasMoreSpends && (
              <Text
                className={styles.moreLink}
                onClick={() => setShowAllSpends(!showAllSpends)}
              >
                {showAllSpends ? '收起' : `更多 (${spends.length - 3}) ›`}
              </Text>
            )}
          </View>
          {displaySpends.map((tx, i) => (
            <View key={i} className={styles.txRow}>
              <Text className={styles.txEmoji}>🤖</Text>
              <Text className={styles.txReason}>{REASON_LABELS[tx.reason] || tx.reason}</Text>
              <Text className={styles.txDate}>{fmtDate(tx.createdAt)}</Text>
              <Text className={[styles.txDelta, styles.txMinus]}>{tx.delta}</Text>
            </View>
          ))}
        </View>
      )}

      <View className={styles.footerTip}>
        <Text>💡 积分规则：每日签到手动领取，每次消耗 1 积分，累积不清零</Text>
      </View>
    </ScrollView>
  );
}
