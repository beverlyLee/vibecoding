// 管理后台：用户管理区块（从原 index.tsx 抽出）
import { useEffect, useState } from 'react';
import { View, Text, Image, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { adminList, adminStats, adminSetStatus, adminDelete, adminSetRole } from '@/services/adminUsers';
import type { AdminStats, UserListItem } from '@/types/admin';
import styles from './index.module.scss';

const ROLE_LABEL: Record<string, string> = { admin: '管理员', operator: '运营', user: '普通用户' };
const ROLE_OPTIONS: Array<'user' | 'operator' | 'admin'> = ['user', 'operator', 'admin'];

function formatDate(d: number | Date | undefined): string {
  if (!d) return '-';
  const date = d instanceof Date ? d : new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function UserManagement({ isAdmin }: { isAdmin: boolean }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [items, setItems] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'banned'>('');
  const [roleFilter, setRoleFilter] = useState<'' | 'user' | 'operator' | 'admin'>('');
  const [page, setPage] = useState(1);

  async function loadAll() {
    setLoading(true);
    setPage(1);
    try {
      const [statsData, listData] = await Promise.all([
        adminStats(),
        adminList({ page: 1, pageSize: 20, keyword, status: statusFilter, role: roleFilter }),
      ]);
      setStats(statsData);
      setItems(listData.items);
      setHasMore(listData.items.length >= 20);
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const listData = await adminList({ page: nextPage, pageSize: 20, keyword, status: statusFilter, role: roleFilter });
      setItems((prev) => [...prev, ...listData.items]);
      setPage(nextPage);
      setHasMore(listData.items.length >= 20);
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleStatus(item: UserListItem) {
    if (!isAdmin) return;
    const next = item.status === 'active' ? 'banned' : 'active';
    const res = await Taro.showModal({
      title: next === 'banned' ? '确认封禁' : '确认解封',
      content: `${item.nickname} 将${next === 'banned' ? '无法登录' : '恢复使用'}`,
      confirmColor: next === 'banned' ? '#D9534F' : '#10B981',
    });
    if (!res.confirm) return;
    try {
      await adminSetStatus(item.openid, next);
      Taro.showToast({ title: next === 'banned' ? '已封禁' : '已解封', icon: 'success' });
      setItems((prev) => prev.map((u) => (u.openid === item.openid ? { ...u, status: next } : u)));
      loadAll();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
  }

  async function handleDelete(item: UserListItem) {
    if (!isAdmin) return;
    const res = await Taro.showModal({
      title: '永久删除账号',
      content: `确定要删除 ${item.nickname} 吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#D9534F',
    });
    if (!res.confirm) return;
    try {
      await adminDelete(item.openid);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setItems((prev) => prev.filter((u) => u.openid !== item.openid));
      loadAll();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '删除失败', icon: 'none' });
    }
  }

  async function handleChangeRole(item: UserListItem, newRole: 'user' | 'operator' | 'admin') {
    if (!isAdmin || item.role === newRole) return;
    const res = await Taro.showModal({
      title: '变更角色',
      content: `将 ${item.nickname} 从 ${ROLE_LABEL[item.role || 'user']} 改为 ${ROLE_LABEL[newRole]}？`,
      confirmColor: '#d4380d',
    });
    if (!res.confirm) return;
    try {
      await adminSetRole(item.openid, newRole);
      Taro.showToast({ title: `已变更为 ${ROLE_LABEL[newRole]}`, icon: 'success' });
      setItems((prev) => prev.map((u) => (u.openid === item.openid ? { ...u, role: newRole } : u)));
      loadAll();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '操作失败', icon: 'none' });
    }
  }

  function pickRole(item: UserListItem) {
    Taro.showActionSheet({
      itemList: ['普通用户 (user)', '运营 (operator)', '管理员 (admin)'],
      success: (res) => handleChangeRole(item, ROLE_OPTIONS[res.tapIndex]),
    });
  }

  return (
    <View>
      {stats && (
        <View className={styles.statsGrid}>
          <View className={styles.statCard}>
            <Text className={styles.statLabel}>总用户数</Text>
            <Text className={styles.statValue}>{stats.total}</Text>
          </View>
          <View className={styles.statCard}>
            <Text className={styles.statLabel}>今日新增</Text>
            <Text className={[styles.statValue, styles.statValueOperator].join(' ')}>{stats.todayNew}</Text>
          </View>
          <View className={styles.statCard}>
            <Text className={styles.statLabel}>活跃</Text>
            <Text className={[styles.statValue, styles.statValueActive].join(' ')}>{stats.active}</Text>
          </View>
          <View className={styles.statCard}>
            <Text className={styles.statLabel}>封禁</Text>
            <Text className={[styles.statValue, styles.statValueBanned].join(' ')}>{stats.banned}</Text>
          </View>
          {isAdmin && (
            <>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>管理员</Text>
                <Text className={[styles.statValue, styles.statValueAdmin].join(' ')}>{stats.byRole.admin}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>运营</Text>
                <Text className={[styles.statValue, styles.statValueOperator].join(' ')}>{stats.byRole.operator}</Text>
              </View>
            </>
          )}
        </View>
      )}

      <View className={styles.filterBar}>
        <View className={styles.searchRow}>
          <Input className={styles.searchInput} placeholder='按昵称搜索' value={keyword}
            onInput={(e) => setKeyword(e.detail.value)} onConfirm={loadAll} />
          <Button size='mini' onClick={loadAll}>搜索</Button>
        </View>
        <View className={styles.chipRow}>
          <Text className={[styles.chip, statusFilter === '' && styles.chipActive].filter(Boolean).join(' ')}
            onClick={() => { setStatusFilter(''); loadAll(); }}>全部</Text>
          <Text className={[styles.chip, statusFilter === 'active' && styles.chipActive].filter(Boolean).join(' ')}
            onClick={() => { setStatusFilter('active'); loadAll(); }}>正常</Text>
          <Text className={[styles.chip, statusFilter === 'banned' && styles.chipActive].filter(Boolean).join(' ')}
            onClick={() => { setStatusFilter('banned'); loadAll(); }}>封禁</Text>
          {isAdmin && (
            <>
              <Text className={[styles.chip, roleFilter === 'admin' && styles.chipActive].filter(Boolean).join(' ')}
                onClick={() => { setRoleFilter(roleFilter === 'admin' ? '' : 'admin'); loadAll(); }}>管理员</Text>
              <Text className={[styles.chip, roleFilter === 'operator' && styles.chipActive].filter(Boolean).join(' ')}
                onClick={() => { setRoleFilter(roleFilter === 'operator' ? '' : 'operator'); loadAll(); }}>运营</Text>
              <Text className={[styles.chip, roleFilter === 'user' && styles.chipActive].filter(Boolean).join(' ')}
                onClick={() => { setRoleFilter(roleFilter === 'user' ? '' : 'user'); loadAll(); }}>普通用户</Text>
            </>
          )}
        </View>
      </View>

      {loading && items.length === 0 ? (
        <View className={styles.emptyTip}>加载中…</View>
      ) : items.length === 0 ? (
        <View className={styles.emptyTip}>暂无匹配的用户</View>
      ) : (
        <>
          <View className={styles.userList}>
            {items.map((item) => (
              <View key={item.openid} className={styles.userCard}>
                <View className={styles.userHeader}>
                  {item.avatar ? (
                    <Image className={styles.avatar} src={item.avatar} mode='aspectFill' />
                  ) : (
                    <View className={styles.avatar} />
                  )}
                  <View className={styles.userMain}>
                    <View className={styles.userNameRow}>
                      <Text className={styles.userNickname}>{item.nickname || '微信用户'}</Text>
                      {isAdmin && item.role && (
                        <Text className={[
                          styles.userRole,
                          item.role === 'admin' && styles.roleAdmin,
                          item.role === 'operator' && styles.roleOperator,
                          item.role === 'user' && styles.roleUser,
                        ].filter(Boolean).join(' ')}>{ROLE_LABEL[item.role]}</Text>
                      )}
                      <Text className={[
                        styles.userStatus,
                        item.status === 'active' ? styles.statusActive : styles.statusBanned,
                      ].join(' ')}>{item.status === 'active' ? '正常' : '封禁'}</Text>
                    </View>
                    <Text className={styles.userMeta}>
                      注册 {formatDate(item.createdAt)} · 最后登录 {formatDate(item.lastLoginAt)} · {item.loginCount} 次
                    </Text>
                  </View>
                </View>
                {isAdmin && (
                  <View className={styles.userActions}>
                    <Button size='mini' className={styles.actionBtn} onClick={() => pickRole(item)}>变更角色</Button>
                    <Button size='mini'
                      className={item.status === 'active' ? [styles.actionBtn, styles.actionBtnWarn].join(' ') : [styles.actionBtn, styles.actionBtnPrimary].join(' ')}
                      onClick={() => handleToggleStatus(item)}>{item.status === 'active' ? '封禁' : '解封'}</Button>
                    <Button size='mini' className={[styles.actionBtn, styles.actionBtnDanger].join(' ')}
                      onClick={() => handleDelete(item)}>删除</Button>
                  </View>
                )}
              </View>
            ))}
          </View>
          {hasMore && (
            <View className={styles.listFooter}>
              <Button size='mini' loading={loadingMore} onClick={loadMore}>{loadingMore ? '加载中…' : '加载更多'}</Button>
            </View>
          )}
          {!hasMore && items.length > 0 && <View className={styles.listFooter}>已全部加载</View>}
        </>
      )}
    </View>
  );
}
