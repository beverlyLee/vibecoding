import { config } from '@engine/config';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

const AUTO_GRADIENT = 'linear-gradient(135deg,#FBF3E4 0%,#F2C6D0 50%,#A9C7D9 100%)';

export function ControlBar() {
  const { state, dispatch } = useApp();
  const { rerenderAll, resolveParams } = useGeneration();

  const pick = (patch: { type: 'SELECT_PALETTE' | 'SELECT_LAYOUT' | 'SET_RATIO'; id: string }) => {
    dispatch(patch);
    // dispatch 后 state 未即时更新，用 setTimeout 让重渲发生在新状态渲染后
    setTimeout(rerenderAll, 0);
  };

  const swatchItems: Array<{ id: string; name: string; isAuto?: boolean }> =
    [{ id: 'auto', name: '自动', isAuto: true }, ...config.palettes];
  const activePalette = resolveParams().palette;

  return (
    <div className="controlbar">
      <div className="ctrl-group">
        <span className="ctrl-label">背景</span>
        <div className="swatch-row">
          {swatchItems.map(p => {
            const active = p.id === state.selectedPalette;
            return (
              <button
                key={p.id}
                className={'swatch' + (active ? ' is-active' : '') + (p.isAuto ? ' swatch-auto' : '')}
                title={p.name}
                style={p.isAuto
                  ? { background: AUTO_GRADIENT, borderColor: active ? 'var(--ink)' : 'rgba(0,0,0,.15)' }
                  : { background: (p as (typeof config.palettes)[number]).base, borderColor: active ? 'var(--ink)' : (p as (typeof config.palettes)[number]).accent }}
                onClick={() => pick({ type: 'SELECT_PALETTE', id: p.id })}
              />
            );
          })}
        </div>
      </div>
      <div className="ctrl-group">
        <span className="ctrl-label">版式</span>
        <div className="chip-row">
          {config.layouts.map(l => (
            <button
              key={l.id}
              className={'chip' + (l.id === state.selectedLayout ? ' is-active' : '')}
              onClick={() => pick({ type: 'SELECT_LAYOUT', id: l.id })}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <div className="ctrl-group">
        <span className="ctrl-label">比例</span>
        <div className="chip-row">
          {config.ratios.map(r => (
            <button
              key={r.id}
              className={'chip' + (r.id === state.ratio ? ' is-active' : '')}
              onClick={() => pick({ type: 'SET_RATIO', id: r.id })}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <span className="mode-pill">文字样式在预览下方编辑 · {activePalette?.name ?? ''}</span>
    </div>
  );
}
