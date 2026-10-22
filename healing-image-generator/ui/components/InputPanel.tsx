import { useRef, useState } from 'react';
import { config } from '@engine/config';
import { resolveRuntime } from '@engine/providers';
import { useApp } from '@ui/store/AppContext';
import { usePhotos } from '@ui/hooks/usePhotos';
import { useGeneration } from '@ui/hooks/useGeneration';
import { useDrafts } from '@ui/hooks/useDrafts';
import { MODE_TIP } from './Topbar';

export function InputPanel() {
  const { state, dispatch } = useApp();
  const { photos, addFiles, removePhoto } = usePhotos();
  const { generate, aiWriteCopy } = useGeneration();
  const { scheduleAutosave } = useDrafts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const chatReady = state.aiSettings.enabled && !!resolveRuntime(state.aiSettings).model;

  const max = config.input.maxCards;
  const textNote = state.mode === 'default'
    ? `将自动切分为 ${state.n} 段，每张卡片一段`
    : `每张卡片对应一张照片（已上传 ${photos.length} 张）`;

  return (
    <aside className="panel">
      <section className="panel-block">
        <h2 className="panel-title"><span className="step">①</span> 上传照片</h2>
        <div
          className={'dropzone' + (dragging ? ' is-drag' : '')}
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >
          <input
            ref={fileRef} type="file" multiple hidden
            accept={config.input.accept.join(',')}
            onChange={e => { addFiles(e.target.files!); e.target.value = ''; }}
          />
          <div className="dz-inner">
            <span className="dz-icon" aria-hidden="true">＋</span>
            <p className="dz-text">拖拽照片到此处 / 点击选择</p>
            <p className="dz-hint">支持 JPG / PNG / WEBP · 单张 ≤ 10MB</p>
          </div>
        </div>
        <ul className="thumb-list">
          {photos.map((p, i) => (
            <li key={p.url} className={'thumb-item' + (i === 0 ? ' is-active' : '')}>
              <img src={p.url} alt="" />
              <button className="thumb-remove" title="移除" onClick={() => removePhoto(i)}>×</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-block">
        <h2 className="panel-title"><span className="step">②</span> 卡片数量</h2>
        <div className="stepper">
          <button className="step-btn" aria-label="减少" disabled={state.n <= 1} onClick={() => dispatch({ type: 'SET_N', n: state.n - 1 })}>−</button>
          <span className="step-val">{state.n}</span>
          <button className="step-btn" aria-label="增加" disabled={state.n >= max} onClick={() => dispatch({ type: 'SET_N', n: state.n + 1 })}>＋</button>
          <span className="step-caption">张</span>
        </div>
      </section>

      <section className="panel-block">
        <h2 className="panel-title">
          <span className="step">③</span> 写文案
          {chatReady && (
            <button className="btn-ghost btn-mini" title="用 AI 生成治愈系文案" onClick={aiWriteCopy}>
              AI 代写 ✍
            </button>
          )}
        </h2>
        <textarea
          className="text-input" rows={5} value={state.text}
          placeholder="写一段想对这个世界说的话……"
          onChange={e => { dispatch({ type: 'SET_TEXT', text: e.target.value }); scheduleAutosave(); }}
        />
        <p className="panel-note">{textNote}</p>
      </section>

      <p className="mode-tip">{MODE_TIP[state.mode]}</p>

      <button className="btn-primary btn-generate" onClick={generate}>生成治愈卡片 ✨</button>
    </aside>
  );
}
