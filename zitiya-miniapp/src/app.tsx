import React, { useEffect } from 'react';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/store/useUserStore';
import { initCloudConfig } from '@/services/sceneConfig';
// 全局样式
import './app.scss';

// 微信云开发环境 ID：开通云开发后，在「云开发控制台」复制环境 ID 填到这里，再重新 build:weapp
const CLOUD_ENV = 'cloud1-d6gyqhf4yd348edad';

function App(props) {
  // 微信环境：先初始化云开发，再加载云端配置
  // （initCloudConfig 内部直接调 Taro.cloud.database()，必须晚于 cloud.init，否则报错静默降级）
  useEffect(() => {
    if (process.env.TARO_ENV === 'weapp') {
      Taro.cloud.init({ env: CLOUD_ENV, traceUser: true });
    }
    initCloudConfig().then(() => {
      console.log('[App] 配置加载完成');
    });
  }, []);

  // 初始化本地设置（LLM 配置等）+ 恢复用户会话（仅 weapp）
  useEffect(() => {
    useAppStore.getState().init();
    if (process.env.TARO_ENV === 'weapp') {
      useUserStore.getState().init().catch((e) => {
        console.warn('[App] 用户会话恢复失败（保持游客）:', e?.message || e);
      });
    }
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
