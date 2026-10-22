import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
// 全局样式
import './app.scss';

function App(props) {
  // 初始化本地设置（LLM 配置等）
  useEffect(() => {
    useAppStore.getState().init();
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
