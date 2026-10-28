// 全局登录弹层 hook：订阅 Taro.eventCenter，任何页面 requireLogin 触发后都会弹出
// 用法：
//   const sheet = useLoginSheet();
//   return <>{pageContent} {sheet}</>;
// 每个页面挂一次即可，多页面都挂也只会弹出最顶层那一个。
//
// ⚠️ 竞态修复：
// App 启动时 authStore.init() 是异步的（要调 user.me），
// 页面 useDidShow 可能在 init 完成前就触发 requireLogin → 弹层。
// 因此这里监听 auth 状态变化，一旦变成 authenticated 就自动关掉弹层。

import React, { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import LoginSheet from '@/components/LoginSheet';
import { useAuthState } from '@/store/useUserStore';

export function useLoginSheet() {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const { status, user } = useAuthState();

  // 一旦登录成功，自动关掉弹层（处理"init 竞态"等场景）
  useEffect(() => {
    if (status === 'authenticated' && user && visible) {
      console.log('[useLoginSheet] ✅ 检测到已登录，自动关闭弹层');
      setVisible(false);
    }
  }, [status, user, visible]);

  useEffect(() => {
    const handler = (payload: { reason?: string }) => {
      // 双保险：如果此时已经登录了，忽略事件
      if (status === 'authenticated' && user) {
        console.log('[useLoginSheet] 已登录，忽略弹层事件');
        return;
      }
      setReason(payload?.reason);
      setVisible(true);
    };
    Taro.eventCenter.on('zuitiya:loginSheet', handler);
    return () => {
      Taro.eventCenter.off('zuitiya:loginSheet', handler);
    };
  }, [status, user]);

  const sheet = (
    <LoginSheet visible={visible} reason={reason} onClose={() => setVisible(false)} />
  );

  return sheet;
}
