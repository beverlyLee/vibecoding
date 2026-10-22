import { useApp } from '@ui/store/AppContext';

export function LoadingMask() {
  const { state } = useApp();
  return (
    <div className="loading-mask" hidden={!state.loading}>
      <div className="loading-card">
        <span className="spinner" aria-hidden="true" />
        <p>{state.loadingMsg ?? (state.aiSettings.enabled && !state.cards ? 'AI 正在理解你的图片…' : '正在生成治愈卡片…')}</p>
      </div>
    </div>
  );
}
