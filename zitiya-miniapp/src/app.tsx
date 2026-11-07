import React, { useEffect } from 'react';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import { authStore } from '@/store/useUserStore';
import { initCloudConfig, initUserQuotes } from '@/services/sceneConfig';
import { logger } from '@/utils/logger';
import { initMonitor } from '@/utils/monitor';
import { initPrivacyAuthorization } from '@/utils/privacy';
// 全局样式
import './app.scss';

// 微信云开发环境 ID：开通云开发后，在「云开发控制台」复制环境 ID 填到这里，再重新 build:weapp
const CLOUD_ENV = 'cloud1-d6gyqhf4yd348edad';

function App(props) {
  // ========== 启动阶段：同步完成所有配置初始化 ==========
  // 规则：App render 完之前，云端配置必须已就绪。
  // 第二次及以后启动靠 Storage 持久化，同步读 ~1ms 完成。
  useEffect(() => {
    (async () => {
      if (process.env.TARO_ENV === 'weapp') {
        Taro.cloud.init({ env: CLOUD_ENV, traceUser: true, timeout: 60000 });
        initPrivacyAuthorization();
      }
      initMonitor();

      // 先恢复用户会话（initUserQuotes 依赖 auth 状态）
      useAppStore.getState().init();
      if (process.env.TARO_ENV === 'weapp') {
        await authStore.init().catch((e) => {
          logger.warn('[App] 用户会话恢复失败（保持游客）:', e?.message || e);
        });
      }

      // 再并行初始化所有云端配置
      await Promise.all([
        initCloudConfig(),
        initUserQuotes(),
        useAppStore.getState().initGlobalLLM(),
      ]);

      logger.info('[App] ✅ 启动初始化全部完成（云端配置 + 用户会话 + LLM）');
    })();
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
