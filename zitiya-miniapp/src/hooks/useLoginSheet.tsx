// 全局登录弹层 hook：订阅 Taro.eventCenter，任何页面 requireLogin 触发后都会弹出
// 用法：
//   const sheet = useLoginSheet();
//   return <>{pageContent} {sheet}</>;
// 每个页面挂一次即可，多页面都挂也只会弹出最顶层那一个。

import React, { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import LoginSheet from '@/components/LoginSheet';

export function useLoginSheet() {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handler = (payload: { reason?: string }) => {
      setReason(payload?.reason);
      setVisible(true);
    };
    Taro.eventCenter.on('zuitiya:loginSheet', handler);
    return () => {
      Taro.eventCenter.off('zuitiya:loginSheet', handler);
    };
  }, []);

  const sheet = (
    <LoginSheet visible={visible} reason={reason} onClose={() => setVisible(false)} />
  );

  return sheet;
}
