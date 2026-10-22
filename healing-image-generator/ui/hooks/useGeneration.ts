import { useCallback, useRef } from 'react';
import { compose, exporter, splitEngine, analyzeEngine, aiBridge } from '@engine';
import { config } from '@engine/config';
import type { PhotoAnalysis } from '@engine/config';
import { resolveRuntime } from '@engine/providers';
import { useApp } from '@ui/store/AppContext';
import { useDrafts } from '@ui/hooks/useDrafts';
import { cardSubject, resolveParamsFor, renderCard, boxesFromSegments } from '@ui/hooks/cardRender';
import type { AppState, PhotoItem } from '@ui/store/state';
import { readImageFromDataUrl, validateFile } from '@ui/hooks/usePhotos';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

export function useGeneration() {
  const { state, dispatch, toast } = useApp();
  const { snapshotDraft } = useDrafts();

  // 始终可读到最新已提交 state（事件回调/异步过程中不受闭包过期影响）
  const stateRef = useRef(state);
  stateRef.current = state;

  const resolveParams = useCallback(() => resolveParamsFor(stateRef.current), []);

  /* 参数切换后即时重渲所有已生成卡片 */
  const rerenderAll = useCallback(() => {
    const s = stateRef.current;
    if (!s.cards) return;
    const next: HTMLCanvasElement[] = [];
    for (let i = 0; i < s.cards.length; i++) {
      next.push(renderCard(s, i, resolveParamsFor(s)));
    }
    dispatch({ type: 'SET_CARDS', cards: next });
  }, [dispatch]);

  const generate = useCallback(async () => {
    const s0 = stateRef.current;
    if (s0.loading) return;
    if (s0.photos.length === 0) { toast('请先上传至少 1 张照片', 'err'); return; }
    const count = s0.mode === 'default' ? s0.n : Math.min(s0.n, s0.photos.length);
    if (count < 1) { toast('照片数量不足，请上传照片', 'err'); return; }

    const segs = splitEngine.split(s0.text, count);
    dispatch({ type: 'SET_PHOTO_ANALYSIS', analysis: null });
    dispatch({ type: 'CLEAR_OVERRIDES' }); // 重新生成时清除单卡覆盖图

    // F3：自动色板时分析首图主色参与选板（仅本地，零出网）；局部保存，渲染不依赖刷新时机
    let localAnalysis: PhotoAnalysis | null = null;
    if (s0.selectedPalette === 'auto' && s0.photos.length) {
      try {
        localAnalysis = analyzeEngine.analyze(s0.photos[0].raw);
      } catch { /* 退化为纯文案打分 */ }
      dispatch({ type: 'SET_PHOTO_ANALYSIS', analysis: localAnalysis });
    }

    dispatch({ type: 'SET_LOADING', loading: true });
    const base = stateRef.current; // photos/mode 最新值
    const effective: AppState = { ...base, photoAnalysis: localAnalysis };
    // 文案切分 → 每张卡一个初始文本框（可在预览中拖动/编辑/增删）
    dispatch({ type: 'SET_TEXT_BOXES', textBoxes: boxesFromSegments(segs, effective) });
    const cards: HTMLCanvasElement[] = [];
    for (let i = 0; i < count; i++) {
      cards.push(renderCard(effective, i, resolveParamsFor(effective)));
      await tick();
    }
    dispatch({ type: 'SET_CARDS', cards });
    dispatch({ type: 'SET_LOADING', loading: false });
    snapshotDraft(); // 生成成功 = 一次定稿，存草稿快照
    toast('生成完成 ✨', 'ok');
  }, [dispatch, toast, snapshotDraft]);

  /* 用重渲后的参数渲染单卡并写回（AI 生图/上传替换共用） */
  const rerenderOne = useCallback((i: number, photo: PhotoItem, okMsg: string) => {
    const cur = stateRef.current;
    if (!cur.cards) return;
    const cards = cur.cards.slice();
    const params = resolveParamsFor(cur);
    const effective: AppState = { ...cur, cardOverrides: { ...cur.cardOverrides, [i]: photo } };
    cards[i] = renderCard(effective, i, params);
    dispatch({ type: 'SET_CARDS', cards });
    toast(okMsg, 'ok');
  }, [dispatch, toast]);

  /* 卡片 i 的文字内容（供 AI 生图提示词用）：文本框文案优先 */
  const cardText = (s: AppState, i: number): string => {
    const boxes = s.textBoxes[i];
    const joined = (boxes ?? []).map(b => b.text.trim()).filter(Boolean).join('\n');
    return joined || s.text;
  };

  /* 卡片级 AI 生图：文字 + 当前图 → 图像模型 → 仅替换本卡图片 */
  const aiImageFor = useCallback(async (i: number) => {
    const s = stateRef.current;
    if (s.loading) return;
    const rt = resolveRuntime(s.aiSettings);
    if (!s.aiSettings.enabled || !rt.apiKey || !rt.imageModel) {
      toast('请先在设置中启用 AI 并填写图像模型', 'err');
      return;
    }
    if (!rt.profile.image) {
      toast(`当前供应商（${rt.profile.name}）不支持生图，请切换供应商`, 'err');
      return;
    }
    const text = cardText(s, i);
    const subject = cardSubject(s, i);
    dispatch({ type: 'SET_LOADING', loading: true, msg: 'AI 正在生成图片，请稍候…' });
    const dataUrl = await aiBridge.generateImage(text, subject.dataUrl, rt, s.ratio);
    dispatch({ type: 'SET_LOADING', loading: false });
    if (!dataUrl) { toast('AI 生图失败，请检查接口/模型配置', 'err'); return; }
    try {
      const photo = await readImageFromDataUrl(dataUrl);
      dispatch({ type: 'SET_CARD_OVERRIDE', index: i, photo });
      rerenderOne(i, photo, '本卡图片已由 AI 重新生成 ✨');
    } catch {
      toast('AI 生成图加载失败', 'err');
    }
  }, [dispatch, toast, rerenderOne]);

  /* 上传图片替换当前卡片（仅该卡，session 内有效） */
  const uploadFor = useCallback(async (i: number, file: File) => {
    if (!validateFile(file)) {
      toast(file.size > config.input.maxFileSize ? '文件超过 10MB，已忽略' : '已忽略非图片文件', 'err');
      return;
    }
    try {
      const { readImage } = await import('@ui/hooks/usePhotos');
      const photo = await readImage(file);
      dispatch({ type: 'SET_CARD_OVERRIDE', index: i, photo });
      rerenderOne(i, photo, '已替换本卡图片');
    } catch {
      toast('图片读取失败', 'err');
    }
  }, [dispatch, toast, rerenderOne]);

  /* 导出前把该卡文本框合并进图片 */
  const mergedCard = useCallback((i: number): HTMLCanvasElement | null => {
    const s = stateRef.current;
    if (!s.cards || !s.cards[i]) return null;
    return compose.drawTextBoxes(s.cards[i], s.textBoxes[i] ?? []);
  }, []);

  const downloadOne = useCallback((i: number) => {
    const merged = mergedCard(i);
    if (!merged) return;
    const fmt = stateRef.current.exportFmt;
    exporter.cardBlob(merged, fmt, config.output.quality).then(b => {
      if (b) exporter.download(b, `治愈卡片_${exporter.pad(i + 1)}.${fmt === 'image/png' ? 'png' : 'jpg'}`);
    });
  }, [mergedCard]);

  const downloadZip = useCallback(async () => {
    const s = stateRef.current;
    if (!s.cards || !s.cards.length) return;
    const merged = s.cards.map((_, i) => mergedCard(i)).filter((c): c is HTMLCanvasElement => !!c);
    await exporter.zip(merged, s.exportFmt, config.output.quality, '治愈卡片');
    toast('整套 ZIP 已下载 ⬇', 'ok');
  }, [toast, mergedCard]);

  /* AI 代写文案：以文本框已有内容为情绪线索，生成后直接填充文本框 */
  const aiWriteCopy = useCallback(async () => {
    const s = stateRef.current;
    if (s.loading) return;
    const rt = resolveRuntime(s.aiSettings);
    if (!s.aiSettings.enabled || !rt.apiKey || !rt.model) {
      toast('请先在设置中启用 AI 并填写 API Key / 模型', 'err');
      return;
    }
    dispatch({ type: 'SET_LOADING', loading: true, msg: 'AI 正在撰写文案…' });
    const copy = await aiBridge.writeCopy(s.text, rt);
    dispatch({ type: 'SET_LOADING', loading: false });
    if (!copy) { toast('AI 代写失败，请检查接口/模型配置', 'err'); return; }
    dispatch({ type: 'SET_TEXT', text: copy });
    toast('文案已生成，可直接修改或点「生成治愈卡片」', 'ok');
  }, [dispatch, toast]);

  return { generate, rerenderAll, downloadOne, downloadZip, resolveParams, aiImageFor, uploadFor, aiWriteCopy };
}
