import { useEffect, useRef, useState } from 'react';
import { config } from '@engine/config';
import type { TextBox } from '@engine/compose';
import { useApp } from '@ui/store/AppContext';
import { useDrafts } from '@ui/hooks/useDrafts';

const PRESET_COLORS = ['#5C4632', '#FFFFFF', '#33484F', '#5A3A40', '#F4B183', '#3B3B3B'];
const ALIGN_ITEMS: Array<{ id: TextBox['align']; label: string }> = [
  { id: 'left', label: '左' }, { id: 'center', label: '中' }, { id: 'right', label: '右' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function parseColor(c: string): { hex: string; alpha: number } {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) return { hex: rgbToHex(+m[1], +m[2], +m[3]), alpha: m[4] !== undefined ? Number(m[4]) : 1 };
  return { hex: c, alpha: 1 };
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0));
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const C = v * s * 255;              // 色度
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v * 255 - C;              // 明度基线
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [C, X, 0];
  else if (h < 120) [r, g, b] = [X, C, 0];
  else if (h < 180) [r, g, b] = [0, C, X];
  else if (h < 240) [r, g, b] = [0, X, C];
  else if (h < 300) [r, g, b] = [X, 0, C];
  else [r, g, b] = [C, 0, X];
  return [Math.round(r + m), Math.round(g + m), Math.round(b + m)];
}

/* 画 HSV 色轮：角度=色相，半径=饱和度，中心白（配合明度滑杆） */
function drawWheel(canvas: HTMLCanvasElement): void {
  const R = canvas.width / 2;
  const ctx = canvas.getContext('2d')!;
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    const grad = ctx.createLinearGradient(R, R, R + R * Math.cos(rad), R + R * Math.sin(rad));
    grad.addColorStop(0, `hsl(${a}, 0%, 100%)`);
    grad.addColorStop(1, `hsl(${a}, 100%, 50%)`);
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.arc(R, R, R - 1, rad - Math.PI / 360, rad + Math.PI / 360);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

interface Hsv { h: number; s: number; v: number }

/* 颜色选择弹框：页内 HSV 色轮 + 明度 + 透明度 + Hex 输入 + 预览（allowNone 用于背景色的「无」） */
function ColorField({ color, onChange, allowNone, label }: {
  color: string; onChange: (c: string) => void; allowNone?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const init = color ? parseColor(color) : { hex: '#ffffff', alpha: 1 };
  const [hsv, setHsv] = useState<Hsv>(() => {
    const [r, g, b] = hexToRgb(init.hex);
    const [h, s, v] = rgbToHsv(r, g, b);
    return { h, s, v };
  });
  const [alpha, setAlpha] = useState(init.alpha);
  const [hexText, setHexText] = useState(init.hex);

  // 外部颜色变化（如点预设色）时同步弹框内部状态
  useEffect(() => {
    const p = color ? parseColor(color) : null;
    if (p) {
      const [r, g, b] = hexToRgb(p.hex);
      const [h, s, v] = rgbToHsv(r, g, b);
      setHsv({ h, s, v });
      setAlpha(p.alpha);
      setHexText(p.hex);
    }
  }, [color]);
  useEffect(() => {
    if (open) drawWheel(wheelRef.current!);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const emit = (h: Hsv, a: number) => {
    const [r, g, b] = hsvToRgb(h.h, h.s, h.v);
    onChange(a >= 1 ? rgbToHex(r, g, b) : `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`);
  };
  const applyHsv = (next: Partial<Hsv>, a = alpha) => {
    const merged = { ...hsv, ...next };
    setHsv(merged);
    setAlpha(a);
    emit(merged, a);
    const [r, g, b] = hsvToRgb(merged.h, merged.s, merged.v);
    setHexText(rgbToHex(r, g, b));
  };
  const applyAlpha = (a: number) => applyHsv({}, a);
  const fromHex = (hex: string, a = alpha) => {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, v] = rgbToHsv(r, g, b);
    applyHsv({ h, s, v }, a);
  };

  // 色轮取色：角度→色相，半径→饱和度（支持按下拖动）；当前近黑色时拾色自动提亮到全明度
  const pickWheel = (e: React.PointerEvent<HTMLCanvasElement>, bumpV = false) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const R = rect.width / 2;
    const dx = e.clientX - rect.left - R, dy = e.clientY - rect.top - R;
    const dist = Math.min(Math.hypot(dx, dy) / R, 1);
    const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    applyHsv({ h, s: dist, v: bumpV && hsv.v <= 0.05 ? 1 : hsv.v });
  };
  const onWheelPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickWheel(e, true);
  };

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const curHex = rgbToHex(...rgb);
  const thumbX = 50 + Math.cos(hsv.h * Math.PI / 180) * hsv.s * 50;
  const thumbY = 50 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * 50;

  return (
    <span className="color-wrap" ref={ref}>
      <button
        className={'color-dot color-custom' + (!color ? ' color-wheel-empty' : '')}
        style={color ? { background: color } : undefined}
        title={`${label}：自定义颜色与透明度`}
        onClick={() => setOpen(o => !o)}
      >{color && parseColor(color).alpha < 1 ? `${Math.round(parseColor(color).alpha * 100)}%` : ''}</button>
      {open && (
        <div className="color-pop" onClick={e => e.stopPropagation()}>
          <div className="color-pop-head">
            <span className="ctrl-label">{label}</span>
            {allowNone && (
              <button className="btn-ghost btn-mini" onClick={() => { onChange(''); setOpen(false); }}>无背景</button>
            )}
            <button className="icon-btn color-pop-close" aria-label="关闭" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="color-pop-row color-wheel-row">
            <span className="color-wheel-wrap">
              <canvas ref={wheelRef} width={140} height={140} className="color-wheel"
                onPointerDown={onWheelPointer}
                onPointerMove={e => { if (e.buttons & 1) pickWheel(e); }}
              />
              <i className="color-wheel-dot" style={{ left: `${thumbX}%`, top: `${thumbY}%`, background: curHex }} />
            </span>
            <span className="color-side">
              <span className="color-preview"><i style={{ background: color || 'transparent' }} /></span>
              <input
                className="editor-select color-hex-input" value={hexText} maxLength={7} spellCheck={false}
                title="输入 Hex 颜色值"
                onChange={e => { setHexText(e.target.value); const v = e.target.value.trim(); if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) fromHex(v); }}
              />
            </span>
          </div>
          <div className="color-pop-row">
            <span className="ctrl-label">明度</span>
            <input type="range" min={10} max={100} value={Math.round(hsv.v * 100)}
              onChange={e => applyHsv({ v: Number(e.target.value) / 100 })} />
            <span className="size-val">{Math.round(hsv.v * 100)}%</span>
          </div>
          <div className="color-pop-row">
            <span className="ctrl-label">透明度</span>
            <input type="range" min={0} max={100} value={Math.round(alpha * 100)}
              onChange={e => applyAlpha(Number(e.target.value) / 100)} />
            <span className="size-val">{Math.round(alpha * 100)}%</span>
          </div>
          <div className="color-pop-row">
            {PRESET_COLORS.map(c => (
              <button
                key={c} className={'color-dot' + (curHex.toLowerCase() === c.toLowerCase() ? ' is-active' : '')}
                style={{ background: c }} title={c}
                onClick={() => fromHex(c)}
              />
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/* 选中文字框后的编辑面板：内容 / 颜色 / 字体 / 字号 / 对齐 / 删除 */
export function TextEditor() {
  const { state, dispatch } = useApp();
  const { scheduleAutosave } = useDrafts();
  const sel = state.selectedBox;
  if (!sel || !state.cards) return null;
  const box = (state.textBoxes[sel.card] ?? []).find(b => b.id === sel.id);
  if (!box) return null;

  const update = (patch: Partial<TextBox>) => {
    dispatch({ type: 'UPDATE_BOX', index: sel.card, id: box.id, patch });
    scheduleAutosave();
  };

  return (
    <div className="text-editor">
      <div className="text-editor-head">
        <span className="text-editor-title">文字 · 第 {sel.card + 1} 张</span>
        <span className="preview-sub">文字可在预览图上直接拖动</span>
        <button className="icon-btn" aria-label="完成" title="完成" onClick={() => dispatch({ type: 'SELECT_BOX', card: sel.card, id: null })}>✓</button>
      </div>
      <textarea
        className="text-input" rows={3} value={box.text} autoFocus
        placeholder="输入文字…（可换行）"
        onChange={e => update({ text: e.target.value })}
      />
      <div className="text-editor-row">
        <span className="ctrl-label">字体</span>
        <select
          className="editor-select" value={box.fontId}
          onChange={e => update({ fontId: e.target.value })}
        >
          {config.fonts.map(f => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.family || undefined }}>{f.name}</option>
          ))}
        </select>
        <span className="ctrl-label">字重</span>
        <select
          className="editor-select editor-select-sm" value={box.weight ?? 400}
          onChange={e => update({ weight: Number(e.target.value) })}
        >
          <option value={400}>常规</option>
          <option value={500}>中等</option>
          <option value={700}>加粗</option>
        </select>
        <span className="ctrl-label">字号</span>
        <input
          type="range" className="size-range" min={24} max={140} step={2}
          value={box.size} onChange={e => update({ size: Number(e.target.value) })}
        />
        <span className="size-val">{box.size}</span>
        <span className="ctrl-label">对齐</span>
        <div className="seg">
          {ALIGN_ITEMS.map(a => (
            <button
              key={a.id} className={'seg-btn' + (box.align === a.id ? ' is-active' : '')}
              onClick={() => update({ align: a.id })}
            >{a.label}</button>
          ))}
        </div>
      </div>
      <div className="text-editor-row">
        <span className="ctrl-label">颜色</span>
        {PRESET_COLORS.map(c => (
          <button
            key={c} className={'color-dot' + (box.color.toLowerCase() === c.toLowerCase() ? ' is-active' : '')}
            style={{ background: c }} title={c} onClick={() => update({ color: c })}
          />
        ))}
        <ColorField color={box.color} onChange={c => update({ color: c })} label="文字颜色" />
        <span className="ctrl-label">行距</span>
        <input
          type="range" min={1} max={2} step={0.02} className="size-range"
          value={box.lineGap ?? 1.32} onChange={e => update({ lineGap: Number(e.target.value) })}
        />
        <span className="size-val">{(box.lineGap ?? 1.32).toFixed(2)}</span>
        <span className="ctrl-label">字间距</span>
        <input
          type="range" min={0} max={20} step={1} className="size-range"
          value={box.letterSpacing ?? 0} onChange={e => update({ letterSpacing: Number(e.target.value) })}
        />
        <span className="size-val">{box.letterSpacing ?? 0}</span>
      </div>
      <div className="text-editor-row">
        <span className="ctrl-label">描边</span>
        <ColorField color={box.strokeColor ?? '#3E362E'} onChange={c => update({ strokeColor: c, strokeWidth: box.strokeWidth || 4 })} label="描边颜色" />
        <input
          type="range" min={0} max={16} step={1} className="size-range"
          value={box.strokeWidth ?? 0}
          onChange={e => update({ strokeWidth: Number(e.target.value), strokeColor: box.strokeColor ?? '#3E362E' })} // 只调宽度没选色时给默认深色描边（白色在浅底上不可见）
        />
        <span className="size-val">{box.strokeWidth ?? 0}</span>
        <span className="ctrl-label">背景色</span>
        <ColorField color={box.bgColor ?? ''} onChange={c => update({ bgColor: c })} allowNone label="背景颜色" />
        <button
          className="btn-ghost btn-mini" title="把当前文字框的颜色、字体、字号、字重、行距、字间距、描边、背景色应用到所有卡片的所有文字"
          onClick={() => dispatch({ type: 'APPLY_STYLE_TO_ALL', index: sel.card, id: box.id })}
        >
          应用到全部
        </button>
        <button className="btn-ghost btn-mini editor-del" onClick={() => dispatch({ type: 'DELETE_BOX', index: sel.card, id: box.id })}>
          删除文字框
        </button>
      </div>
    </div>
  );
}
