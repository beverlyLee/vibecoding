// ================================================================
// 全局监控 + 行为埋点事件常量
// ----------------------------------------------------------------
// 负责：注册全局异常捕获（真机/浏览器都可观测），并在启动时记录 APP_LAUNCH。
// 页面级曝光埋点（page_view）由各页面自行调用 track(EVENTS.PAGE_VIEW)。
// ================================================================

import Taro from '@tarojs/taro';
import { logger, track } from './logger';

/** 埋点事件名（保持单一事实来源，避免拼写漂移） */
export const EVENTS = {
  APP_LAUNCH: 'app_launch',
  PAGE_VIEW: 'page_view',
  ANALYZE_START: 'analyze_start',
  ANALYZE_DONE: 'analyze_done',
  ANALYZE_ERROR: 'analyze_error',
  COPY_RESPONSE: 'copy_response',
  REPHRASE: 'rephrase',
  LLM_CONFIG_SAVE: 'llm_config_save',
  ENGINE_TYPE: 'engine_type',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

let inited = false;

/**
 * 初始化全局监控。重复调用安全（幂等）。
 * - 微信小程序：Taro.onError + Taro.onUnhandledRejection
 * - H5 / 浏览器：window error + unhandledrejection
 */
export function initMonitor(engineType: string = ''): void {
  if (inited) return;
  inited = true;

  // 小程序运行时错误
  try {
    Taro.onError?.((err: any) => {
      logger.error('[Monitor] 运行时错误:', err?.message || err);
    });
  } catch {
    /* ignore */
  }

  // 小程序未捕获 Promise 拒绝
  try {
    (Taro as any).onUnhandledRejection?.((err: any) => {
      logger.error('[Monitor] 未捕获 Promise 拒绝:', err?.reason?.message || err?.reason);
    });
  } catch {
    /* ignore */
  }

  // 浏览器环境（H5）
  if (typeof (globalThis as any).window !== 'undefined') {
    (globalThis as any).window.addEventListener('unhandledrejection', (e: any) => {
      logger.error('[Monitor] 未捕获 Promise 拒绝:', e?.reason?.message || e?.reason);
    });
    (globalThis as any).window.addEventListener('error', (e: any) => {
      if (e?.message) logger.error('[Monitor] 全局错误:', e.message);
    });
  }

  track(EVENTS.APP_LAUNCH, { engineType });
  logger.info('[Monitor] 全局监控已初始化');
}
