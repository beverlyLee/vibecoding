/* ui/hooks/useDrafts.ts · 草稿箱：防抖自动保存 / 生成快照 / 恢复 / 删除（IndexedDB，含原图 + 覆盖图 + 文本框） */
import { useCallback, useEffect, useRef } from 'react';
import { analyzeEngine, splitEngine } from '@engine';
import { useApp } from '@ui/store/AppContext';
import { upsertDraft, deleteDraft, loadDrafts, type Draft, type DraftData } from '@ui/store/drafts';
import { readImage } from '@ui/hooks/usePhotos';
import { resolveParamsFor, renderCard, boxesFromSegments } from '@ui/hooks/cardRender';
import type { AppState, PhotoItem } from '@ui/store/state';

const AUTOSAVE_DEBOUNCE = 1200;

/* 从 state 抽取草稿数据（文案 + 全部设置 + 原图 Blob + 覆盖图 + 文本框，File 原样入库可无损还原） */
function draftData(s: AppState): DraftData {
  return {
    text: s.text,
    mode: s.mode,
    n: s.n,
    selectedPalette: s.selectedPalette,
    selectedFont: s.selectedFont,
    selectedLayout: s.selectedLayout,
    ratio: s.ratio,
    photos: s.photos.map(p => ({ name: p.file.name, type: p.file.type, blob: p.file })),
    overrides: Object.entries(s.cardOverrides).map(([i, p]) => ({
      index: Number(i), name: p.file.name, type: p.file.type, blob: p.file,
    })),
    textBoxes: s.textBoxes,
  };
}

export function useDrafts() {
  const { state, dispatch, toast } = useApp();
  const stateRef = useRef(state);
  stateRef.current = state;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const saveNow = useCallback(async () => {
    const s = stateRef.current;
    if (!s.text.trim()) return;
    const d = await upsertDraft(s.draftId, draftData(s));
    if (d && d.id !== s.draftId) dispatch({ type: 'SET_DRAFT_ID', id: d.id });
  }, [dispatch]);

  /* 防抖自动保存：文案输入停顿后原位更新当前草稿（无绑定则新建） */
  const scheduleAutosave = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveNow, AUTOSAVE_DEBOUNCE);
  }, [saveNow]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  /* 生成成功后的快照（与自动保存共用 upsert 逻辑） */
  const snapshotDraft = useCallback(() => { void saveNow(); }, [saveNow]);

  /* 恢复草稿：文案 + 设置 + 照片（含单卡覆盖图）+ 文本框一键还原并自动重渲出图 */
  const restoreDraft = useCallback(async (d: Draft) => {
    // 原图 Blob → 全分辨率 PhotoItem（复用上传读取管线，个别损坏图跳过）
    const photos: PhotoItem[] = [];
    for (const dp of d.photos) {
      try {
        photos.push(await readImage(new File([dp.blob], dp.name, { type: dp.type })));
      } catch { /* 单图损坏不影响整体恢复 */ }
    }
    // 单卡覆盖图（AI 生图/上传替换）同样还原
    const overrides: Record<number, PhotoItem> = {};
    for (const ov of d.overrides ?? []) {
      try {
        overrides[ov.index] = await readImage(new File([ov.blob], ov.name, { type: ov.type }));
      } catch { /* 忽略损坏覆盖图 */ }
    }
    state.photos.forEach(p => URL.revokeObjectURL(p.url));
    Object.values(state.cardOverrides).forEach(p => URL.revokeObjectURL(p.url));

    // 旧草稿没有文本框数据：由文案切分补建，保持可拖动体验
    const count = d.mode === 'default' ? d.n : Math.max(1, Math.min(d.n, photos.length));
    const textBoxes = d.textBoxes
      ?? boxesFromSegments(splitEngine.split(d.text, count), {
        ...stateRef.current, text: d.text, mode: d.mode, n: d.n,
        selectedPalette: d.selectedPalette, selectedFont: d.selectedFont, selectedLayout: d.selectedLayout,
        photos, photoAnalysis: null,
      });

    const base = stateRef.current;
    const effective: AppState = {
      ...base,
      mode: d.mode, n: d.n, text: d.text, photos,
      selectedPalette: d.selectedPalette, selectedFont: d.selectedFont, selectedLayout: d.selectedLayout,
      ratio: d.ratio ?? '2:3',
      cardOverrides: overrides, textBoxes,
      photoAnalysis: null,
    };
    // 自动色板：用恢复后的首图重新分析，保证色板选择与生成时一致
    if (d.selectedPalette === 'auto' && photos[0]) {
      try { effective.photoAnalysis = analyzeEngine.analyze(photos[0].raw); } catch { /* 忽略 */ }
    }

    // 立即重渲卡片：恢复后无需手动再点「生成」，图片与文字直接出现
    const cards: HTMLCanvasElement[] = [];
    const params = resolveParamsFor(effective);
    for (let i = 0; i < count; i++) cards.push(renderCard(effective, i, params));

    dispatch({ type: 'SET_MODE', mode: d.mode });
    dispatch({ type: 'SET_N', n: d.n });
    dispatch({ type: 'SET_TEXT', text: d.text });
    dispatch({ type: 'SELECT_PALETTE', id: d.selectedPalette });
    dispatch({ type: 'SELECT_FONT', id: d.selectedFont });
    dispatch({ type: 'SELECT_LAYOUT', id: d.selectedLayout });
    dispatch({ type: 'SET_RATIO', id: d.ratio ?? '2:3' });
    dispatch({ type: 'SET_PHOTOS', photos });
    dispatch({ type: 'SET_PHOTO_ANALYSIS', analysis: effective.photoAnalysis });
    dispatch({ type: 'CLEAR_OVERRIDES' });
    for (const [i, p] of Object.entries(overrides)) dispatch({ type: 'SET_CARD_OVERRIDE', index: Number(i), photo: p });
    dispatch({ type: 'SET_TEXT_BOXES', textBoxes });
    dispatch({ type: 'SET_CARDS', cards });
    dispatch({ type: 'SET_DRAFT_ID', id: d.id });
    dispatch({ type: 'SET_UI', ui: { draftsOpen: false } });
    toast(photos.length ? `草稿已恢复（含 ${photos.length} 张照片）` : '草稿已恢复', 'ok');
  }, [dispatch, toast, state.photos, state.cardOverrides]);

  /* 删除草稿：若是当前绑定的草稿，解除绑定 */
  const removeDraft = useCallback((id: string) => {
    void deleteDraft(id);
    if (stateRef.current.draftId === id) dispatch({ type: 'SET_DRAFT_ID', id: null });
  }, [dispatch]);

  return { scheduleAutosave, snapshotDraft, restoreDraft, removeDraft, loadDrafts };
}
