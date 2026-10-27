import React, { useState } from 'react';
import { View, Text, Image, Input, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useUserStore } from '@/store/useUserStore';
import { useLoginSheet } from '@/hooks/useLoginSheet';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  operator: '运营',
  user: ''
};

// 我的页：游客态极简卡片，点任何需要登录的功能会自动弹出全局底部登录层
// 已登录显示档案 + 菜单
export default function ProfilePage() {
  const status = useUserStore((s) => s.status);
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const updateProfile = useUserStore((s) => s.updateProfile);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  // 订阅全局登录弹层事件（requireLogin 触发）
  const loginSheet = useLoginSheet();

  const isLoggedIn = status === 'authenticated' && !!user;
  const isStaff = isLoggedIn && user && (user.role === 'admin' || user.role === 'operator');

  // 切换到"我的"页面时，如果未登录自动弹出登录弹层
  useDidShow(() => {
    if (!isLoggedIn) {
      Taro.eventCenter.trigger('zuitiya:loginSheet', {});
    }
  });

  const startEdit = () => {
    setEditName(user?.nickname || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) {
      Taro.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    try {
      await updateProfile({ nickname: editName.trim() });
      setEditing(false);
      Taro.showToast({ title: '已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    }
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleChooseAvatar = async () => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = res.tempFilePaths[0];
      try {
        const upload = await Taro.cloud.uploadFile({ cloudPath: `avatars/${Date.now()}.png`, filePath: path });
        await updateProfile({ avatar: upload.fileID });
        Taro.showToast({ title: '头像已更新', icon: 'success' });
      } catch {
        Taro.showToast({ title: '头像上传失败', icon: 'none' });
      }
    } catch { /* 用户取消 */ }
  };

  const handleAdminEntry = () => {
    Taro.navigateTo({ url: '/pages/admin/index' });
  };

  const handlePrivacy = () => {
    Taro.navigateTo({ url: '/pages/privacy/index' });
  };

  const handleLogout = () => {
    logout();
  };

  // ======== 游客态 ========
  if (!isLoggedIn) {
    return (
      <>
        <View className={styles.page}>
          <View className={styles.guestCard}>
            <Image className={styles.guestLogo} src={logoDuck} mode='aspectFit' />
            <Text className={styles.guestTitle}>欢迎来到嘴替鸭</Text>
            <Text className={styles.guestDesc}>
              登录后可使用拆招、出招等全部功能
            </Text>
            <Text className={styles.guestHint}>已登录的微信账号会自动识别</Text>
          </View>
        </View>
        {loginSheet}
      </>
    );
  }

  // ======== 已登录态 ========
  return (
    <>
      <View className={styles.page}>
        {/* 头卡片 */}
        <View className={styles.userCard}>
          <View className={styles.avatarWrap} onClick={handleChooseAvatar}>
            {user?.avatar ? (
              <Image className={styles.avatar} src={user.avatar} mode='aspectFill' />
            ) : (
              <View className={styles.avatarPlaceholder}>鸭</View>
            )}
            <Text className={styles.avatarEditHint}>更换头像</Text>
          </View>
          <View className={styles.userInfo}>
            <View className={styles.nicknameRow}>
              {editing ? (
                <Input
                  className={styles.nickname}
                  value={editName}
                  maxlength={32}
                  focus
                  onInput={(e) => setEditName(e.detail.value)}
                  onBlur={saveEdit}
                />
              ) : (
                <Text className={styles.nickname} onClick={startEdit}>
                  {user?.nickname || '微信用户'}
                </Text>
              )}
              {!editing && user?.role && user.role !== 'user' && (
                <Text className={[
                  styles.roleBadge,
                  user.role === 'admin' ? styles.roleAdmin : styles.roleOperator
                ].join(' ')}>
                  {ROLE_LABEL[user.role]}
                </Text>
              )}
            </View>
            {editing && (
              <View style={{ display: 'flex', gap: '16rpx', marginTop: '8rpx' }}>
                <Button size='mini' onClick={cancelEdit}>取消</Button>
                <Button size='mini' type='primary' onClick={saveEdit}>保存</Button>
              </View>
            )}
          </View>
        </View>

        {/* 菜单组 */}
        <View className={styles.sectionTitle}>功能</View>
        <View className={styles.menuCard}>
          {isStaff && (
            <View className={styles.menuItem} onClick={handleAdminEntry}>
              <View className={`${styles.menuIcon} ${styles.menuIconAdmin}`}>🛠️</View>
              <Text className={styles.menuLabel}>管理后台</Text>
              {user?.role === 'admin' && <Text className={styles.menuValue}>全部权限</Text>}
              {user?.role === 'operator' && <Text className={styles.menuValue}>配置与统计</Text>}
              <Text className={styles.menuArrow}>›</Text>
            </View>
          )}
        </View>

        <View className={styles.sectionTitle}>账户</View>
        <View className={styles.menuCard}>
          <View className={styles.menuItem} onClick={handlePrivacy}>
            <View className={`${styles.menuIcon} ${styles.menuIconPrivacy}`}>🔒</View>
            <Text className={styles.menuLabel}>隐私协议</Text>
            <Text className={styles.menuArrow}>›</Text>
          </View>
        </View>

        <View className={styles.menuCard}>
          <View className={styles.menuItem} onClick={handleLogout}>
            <View className={`${styles.menuIcon} ${styles.menuIconLogout}`}>↪️</View>
            <Text className={styles.menuLabel}>退出登录</Text>
          </View>
        </View>
      </View>
      {loginSheet}
    </>
  );
}
