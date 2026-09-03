import { useEffect, useState } from 'react';
import { useApp } from '@ui/store/AppContext';
import { useDrafts } from '@ui/hooks/useDrafts';
import { config } from '@engine/config';
import type { Draft } from '@ui/store/drafts';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DraftModal() {
  const { state, dispatch } = useApp();
  const { restoreDraft, removeDraft, loadDrafts } = useDrafts();
  const open = state.ui.draftsOpen;
  const close = () => dispatch({ type: 'SET_UI', ui: { draftsOpen: false } });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadDrafts().then(setDrafts);
  }, [open, loadDrafts]);

  if (!open) return null;

  const onRemove = (id: string) => {
    removeDraft(id);
    setDrafts(list => list.filter(d => d.id !== id));
  };

  const onRestore = (d: Draft) => {
    if (restoring) return;
    setRestoring(true);
    restoreDraft(d).finally(() => setRestoring(false));
  };

  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal draft-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>草稿箱 <span className="draft-count">{drafts.length}</span></h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        {drafts.length === 0 ? (
          <p className="draft-empty">暂无草稿。写下文案后会自动保存（含照片），生成卡片时也会存一份快照，长期保留在浏览器本地。</p>
        ) : (
          <ul className="draft-list">
            {drafts.map(d => (
              <li key={d.id}>
                <button
                  className="draft-item" title="恢复此草稿" disabled={restoring}
                  onClick={() => onRestore(d)}
                >
                  <span className="draft-title">{d.title}</span>
                  <span className="draft-meta">
                    {d.mode === 'default' ? `默认 · ${d.n} 张` : '逐图'} · {config.layouts.find(l => l.id === d.selectedLayout)?.name ?? d.selectedLayout}
                    {d.photos.length ? ` · ${d.photos.length} 图` : ''}
                    {d.overrides?.length ? ` · ${d.overrides.length} 替换图` : ''}
                    {Object.values(d.textBoxes ?? {}).flat().length ? ` · ${Object.values(d.textBoxes ?? {}).flat().length} 文字框` : ''}
                    {' · '}{fmtTime(d.savedAt)}
                  </span>
                </button>
                <button
                  className="icon-btn draft-del" title="删除草稿" disabled={restoring}
                  onClick={() => onRemove(d.id)}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
