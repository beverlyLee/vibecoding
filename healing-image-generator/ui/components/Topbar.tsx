import { useApp } from '@ui/store/AppContext';
import type { Mode } from '@ui/store/state';

const MODE_TIP: Record<Mode, string> = {
  default: '默认模式：1 张照片复用于所有卡片，文案按张数自动切分，可逐卡改字。',
  multi: '逐图主体：每张照片成为一张卡片的主体，风格仍统一；文案按张数自动切分。',
};

export function Topbar() {
  const { state, dispatch } = useApp();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo" aria-hidden="true">☀</span>
        <span className="brand-name">治愈系图片生成器</span>
      </div>
      <div className="topbar-right">
        <div className="seg" role="tablist" aria-label="模式切换">
          {(['default', 'multi'] as Mode[]).map(m => (
            <button
              key={m}
              className={'seg-btn' + (state.mode === m ? ' is-active' : '')}
              role="tab"
              onClick={() => dispatch({ type: 'SET_MODE', mode: m })}
            >
              {m === 'default' ? '默认模式' : '逐图主体'}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="草稿箱（自动保存文案、设置与照片）" onClick={() => dispatch({ type: 'SET_UI', ui: { draftsOpen: true } })}>
          🗂<span className="icon-btn-label">草稿箱</span>
        </button>
        <button className="icon-btn" title="设置（AI 模式）" onClick={() => dispatch({ type: 'SET_UI', ui: { settingsOpen: true } })}>
          ⚙<span className="icon-btn-label">设置</span>
        </button>
        <button className="icon-btn" title="帮助" onClick={() => dispatch({ type: 'SET_UI', ui: { helpOpen: true } })}>
          ?<span className="icon-btn-label">帮助</span>
        </button>
      </div>
    </header>
  );
}

export { MODE_TIP };
