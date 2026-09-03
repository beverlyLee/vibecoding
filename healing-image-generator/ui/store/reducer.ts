import { config } from '@engine/config';
import { initialState } from './state';
import type { AppState, Mode, PhotoItem, ToastItem, UiState } from './state';
import type { AiSettings, PhotoAnalysis } from '@engine/config';
import type { TextBox } from '@engine/compose';

export type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_N'; n: number }
  | { type: 'SET_TEXT'; text: string }
  | { type: 'ADD_PHOTOS'; photos: PhotoItem[] }
  | { type: 'SET_PHOTOS'; photos: PhotoItem[] }
  | { type: 'REMOVE_PHOTO'; index: number }
  | { type: 'SELECT_PALETTE'; id: string }
  | { type: 'SELECT_FONT'; id: string }
  | { type: 'SELECT_LAYOUT'; id: string }
  | { type: 'SET_RATIO'; id: string }
  | { type: 'SET_AI_SETTINGS'; settings: AiSettings }
  | { type: 'SET_PHOTO_ANALYSIS'; analysis: PhotoAnalysis | null }
  | { type: 'SET_CARDS'; cards: HTMLCanvasElement[] | null }
  | { type: 'SET_CARD_OVERRIDE'; index: number; photo: PhotoItem | null }
  | { type: 'CLEAR_OVERRIDES' }
  | { type: 'SET_TEXT_BOXES'; textBoxes: Record<number, TextBox[]> }
  | { type: 'ADD_BOX'; index: number; box: TextBox }
  | { type: 'UPDATE_BOX'; index: number; id: string; patch: Partial<TextBox> }
  | { type: 'APPLY_STYLE_TO_ALL'; index: number; id: string }
  | { type: 'DELETE_BOX'; index: number; id: string }
  | { type: 'SELECT_BOX'; card: number; id: string | null }
  | { type: 'SET_DRAFT_ID'; id: string | null }
  | { type: 'SET_LOADING'; loading: boolean; msg?: string | null }
  | { type: 'SET_EXPORT_FMT'; fmt: string }
  | { type: 'SET_UI'; ui: Partial<UiState> }
  | { type: 'TOAST'; toast: ToastItem }
  | { type: 'DISMISS_TOAST'; id: number };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_N':
      return { ...state, n: Math.min(config.input.maxCards, Math.max(1, action.n)) };
    case 'SET_TEXT':
      return { ...state, text: action.text };
    case 'ADD_PHOTOS':
      // 默认模式只保留第一张作为主体（对齐旧 addFiles 行为）
      return { ...state, photos: state.mode === 'default' ? action.photos.slice(0, 1) : [...state.photos, ...action.photos] };
    case 'SET_PHOTOS':
      return { ...state, photos: action.photos };
    case 'REMOVE_PHOTO':
      return { ...state, photos: state.photos.filter((_, i) => i !== action.index) };
    case 'SELECT_PALETTE':
      return { ...state, selectedPalette: action.id };
    case 'SELECT_FONT':
      return { ...state, selectedFont: action.id };
    case 'SELECT_LAYOUT':
      return { ...state, selectedLayout: action.id };
    case 'SET_RATIO':
      return { ...state, ratio: action.id };
    case 'SET_AI_SETTINGS':
      return { ...state, aiSettings: action.settings };
    case 'SET_PHOTO_ANALYSIS':
      return { ...state, photoAnalysis: action.analysis };
    case 'SET_CARDS':
      return { ...state, cards: action.cards };
    case 'SET_CARD_OVERRIDE': {
      const cardOverrides = { ...state.cardOverrides };
      if (action.photo) cardOverrides[action.index] = action.photo;
      else delete cardOverrides[action.index];
      return { ...state, cardOverrides };
    }
    case 'CLEAR_OVERRIDES':
      return { ...state, cardOverrides: {} };
    case 'SET_TEXT_BOXES':
      return { ...state, textBoxes: action.textBoxes, selectedBox: null };
    case 'ADD_BOX':
      return {
        ...state,
        textBoxes: { ...state.textBoxes, [action.index]: [...(state.textBoxes[action.index] ?? []), action.box] },
        selectedBox: { card: action.index, id: action.box.id },
      };
    case 'UPDATE_BOX':
      return {
        ...state,
        textBoxes: {
          ...state.textBoxes,
          [action.index]: (state.textBoxes[action.index] ?? []).map(b => b.id === action.id ? { ...b, ...action.patch } : b),
        },
      };
    case 'APPLY_STYLE_TO_ALL': {
      // 把当前文字框的样式参数（不含内容与位置）应用到所有卡片的所有文字框
      const src = (state.textBoxes[action.index] ?? []).find(b => b.id === action.id);
      if (!src) return state;
      const style = {
        color: src.color, fontId: src.fontId, size: src.size, align: src.align,
        weight: src.weight, lineGap: src.lineGap, letterSpacing: src.letterSpacing,
        strokeColor: src.strokeColor, strokeWidth: src.strokeWidth, bgColor: src.bgColor,
      };
      const textBoxes: Record<number, TextBox[]> = {};
      for (const [k, arr] of Object.entries(state.textBoxes)) {
        textBoxes[Number(k)] = arr.map(b => ({ ...b, ...style }));
      }
      return { ...state, textBoxes };
    }
    case 'DELETE_BOX': {
      const textBoxes = {
        ...state.textBoxes,
        [action.index]: (state.textBoxes[action.index] ?? []).filter(b => b.id !== action.id),
      };
      const selected = state.selectedBox;
      return {
        ...state,
        textBoxes,
        selectedBox: selected && selected.card === action.index && selected.id === action.id ? null : selected,
      };
    }
    case 'SELECT_BOX':
      return { ...state, selectedBox: action.id ? { card: action.card, id: action.id } : null };
    case 'SET_DRAFT_ID':
      return { ...state, draftId: action.id };
    case 'SET_LOADING':
      return { ...state, loading: action.loading, loadingMsg: action.loading ? (action.msg ?? null) : null };
    case 'SET_EXPORT_FMT':
      return { ...state, exportFmt: action.fmt };
    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.ui } };
    case 'TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    default:
      return state;
  }
}

export { initialState };
