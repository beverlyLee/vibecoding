import React, { useEffect, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/useUserStore';
import styles from './index.module.scss';

interface LoginSheetProps {
  visible: boolean;
  onClose?: () => void;
  reason?: string;
}

// 极简登录弹层：只有隐私勾选 + 微信一键登录按钮
export default function LoginSheet({ visible, onClose }: LoginSheetProps) {
  const login = useUserStore((s) => s.login);

  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setAgreePrivacy(false);
      setLoading(false);
    }
  }, [visible]);

  if (!visible) return null;

  const handleClose = () => {
    setAgreePrivacy(false);
    onClose?.();
  };

  const handleLogin = async () => {
    if (!agreePrivacy) {
      Taro.showToast({ title: '请先同意隐私协议', icon: 'none' });
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      await login();
      handleClose();
      Taro.showToast({ title: '登录成功', icon: 'success' });
    } catch (e: any) {
      if (e?.code !== 403) {
        Taro.showToast({ title: e?.message || '登录失败', icon: 'none' });
      }
    } finally {
      setLoading(false);
    }
  };

  const openPrivacy = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    Taro.navigateTo({ url: '/pages/privacy/index' });
  };

  return (
    <View className={styles.mask} onClick={handleClose}>
      <View className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        {/* 隐私 */}
        <View className={styles.privacyRow} onClick={() => setAgreePrivacy((v) => !v)}>
          <View className={[styles.checkbox, agreePrivacy && styles.checkboxChecked].filter(Boolean).join(' ')}>
            {agreePrivacy && <Text className={styles.checkboxTick}>✓</Text>}
          </View>
          <Text className={styles.privacyText}>
            我已阅读并同意
            <Text className={styles.privacyLink} onClick={openPrivacy}>《隐私协议》</Text>
          </Text>
        </View>

        <Button
          className={styles.loginBtn}
          disabled={!agreePrivacy || loading}
          loading={loading}
          onClick={handleLogin}
        >
          微信一键登录
        </Button>

        <Button className={styles.cancelBtn} onClick={handleClose}>
          暂不登录
        </Button>
      </View>
    </View>
  );
}
