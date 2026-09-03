import { useEffect, useRef } from 'react';
import { config } from '@engine/config';
import { fontEngine } from '@engine';
import { BOX_WIDTH_RATIO, BOX_LINE_GAP } from '@engine/compose';
import type { TextBox } from '@engine/compose';
import { getProfile } from '@engine/providers';
import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';
import { useDrafts } from '@ui/hooks/useDrafts';
import { makeBox } from '@ui/hooks/cardRender';

const clampPos = (v: number) => Math.min(0.97, Math.max(0.03, v));

function BoxFontFamily(fontId: string): string {
  const f = config.fonts.find(x => x.id === fontId);
  return f && f.family ? f.family : fontEngine.family('auto');
}

function TextBoxEl({ box, card, selected, dispatch, onDragEnd }: {
  box: TextBox; card: number; selected: boolean;
  dispatch: ReturnType<typeof useApp>['dispatch'];
  onDragEnd: (moved: boolean) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation(); // 不触发卡片空白处的取消选中
    e.preventDefault();
    dispatch({ type: 'SELECT_BOX', card, id: box.id });
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: box.x, oy: box.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const cardEl = e.currentTarget.closest('.card') as HTMLElement | null;
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    if (!d.moved) return;
    dispatch({
      type: 'UPDATE_BOX', index: card, id: box.id,
      patch: {
        x: clampPos(d.ox + (e.clientX - d.startX) / rect.width),
        y: clampPos(d.oy + (e.clientY - d.startY) / rect.height),
      },
    });
  };
  const onPointerUp = () => {
    const moved = !!dragRef.current?.moved;
    dragRef.current = null;
    onDragEnd(moved);
  };

  return (
    <div
      className={'text-box' + (selected ? ' is-selected' : '')}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${BOX_WIDTH_RATIO * 100}%`,
        color: box.color,
        fontFamily: BoxFontFamily(box.fontId),
        fontSize: `${(box.size / config.output.width) * 100}cqw`,
        lineHeight: box.lineGap ?? BOX_LINE_GAP,
        textAlign: box.align,
        fontWeight: box.weight ?? 400,
        letterSpacing: box.letterSpacing ? `${(box.letterSpacing / config.output.width) * 100}cqw` : 'normal',
        WebkitTextStroke: box.strokeWidth && box.strokeColor
          ? `${(box.strokeWidth / config.output.width) * 100}cqw ${box.strokeColor}`
          : undefined,
        paintOrder: 'stroke fill',
        background: box.bgColor || undefined,
        borderRadius: box.bgColor ? '0.25em' : undefined,
        padding: box.bgColor ? '0.12em 0' : undefined,
      }}
      title="拖动调整位置 · 点击编辑"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={e => e.stopPropagation()} // 避免冒泡到卡片的「点空白取消选中」
    >{box.text}</div>
  );
}

export function PreviewGrid() {
  const { state, dispatch } = useApp();
  const { downloadOne, aiImageFor, uploadFor, resolveParams } = useGeneration();
  const { scheduleAutosave } = useDrafts();
  const cards = state.cards;
  const hasCards = !!cards && cards.length > 0;
  const aiReady = state.aiSettings.enabled && !!getProfile(state.aiSettings.providerId).image;
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef(-1);

  const addBox = (i: number) => {
    const params = resolveParams();
    dispatch({ type: 'ADD_BOX', index: i, box: makeBox('新的文字', params, state.selectedLayout) });
  };

  const onDragEnd = (moved: boolean) => { if (moved) scheduleAutosave(); };

  return (
    <>
      <div className="preview-head">
        <span>{hasCards ? `预览（${cards!.length} / ${cards!.length}）` : '预览（0 / 0）'}</span>
        <span className="preview-sub">拖动文字调位置 · 点击文字编辑 · 悬停卡片加文字框</span>
      </div>
      <div className="preview-area">
        {!hasCards && (
          <div className="empty-state is-show">
            <span className="empty-icon" aria-hidden="true">🌿</span>
            <p className="empty-title">还没有卡片</p>
            <p className="empty-desc">上传照片、写下文案，点「生成治愈卡片」开始。</p>
          </div>
        )}
        <div className="preview-grid">
          {hasCards && cards!.map((cv, i) => {
            const boxes = state.textBoxes[i] ?? [];
            return (
              <div key={i} className="card" onClick={() => dispatch({ type: 'SELECT_BOX', card: i, id: null })}>
                <CardCanvas canvas={cv} />
                <div className="text-layer">
                  {boxes.map(b => (
                    <TextBoxEl
                      key={b.id} box={b} card={i} dispatch={dispatch} onDragEnd={onDragEnd}
                      selected={state.selectedBox?.card === i && state.selectedBox?.id === b.id}
                    />
                  ))}
                </div>
                <div className="card-badge">{i + 1}</div>
                <div className="card-actions" onClick={e => e.stopPropagation()}>
                  <button className="card-act" title="添加文本框" onClick={() => addBox(i)}>＋文字</button>
                  <button className="card-act" title="上传图片替换本卡" onClick={() => { uploadTargetRef.current = i; fileRef.current?.click(); }}>换图</button>
                  {aiReady && (
                    <button className="card-act" title="AI 生成相似图片" onClick={() => aiImageFor(i)}>AI 图 ✨</button>
                  )}
                  <button className="card-act" onClick={() => downloadOne(i)}>下载 ⬇</button>
                </div>
              </div>
            );
          })}
        </div>
        <input
          ref={fileRef} type="file" accept={config.input.accept.join(',')} hidden
          onChange={e => {
            const f = e.target.files?.[0];
            if (f && uploadTargetRef.current >= 0) uploadFor(uploadTargetRef.current, f);
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
}

function CardCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(canvas);
  }, [canvas]);
  return <div className="card-canvas" ref={ref} />;
}
