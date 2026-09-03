import type { AiSettings, PhotoAnalysis } from '@engine/config';
import { DEFAULT_AI_SETTINGS, migrateLegacySettings } from '@engine/providers';
import type { TextBox } from '@engine/compose';

export type Mode = 'default' | 'multi';

export interface PhotoItem {
  file: File;
  url: string;              // ObjectURL（缩略图用，卸载时 revoke）
  img: HTMLImageElement | HTMLCanvasElement; // prepareImage 后的合成用图
  dataUrl: string;          // 512px 缩略 dataURL（AI 模式发往用户 endpoint）
  raw: HTMLImageElement;    // 原图（analyze 用）
}

export interface ToastItem { id: number; msg: string; kind?: 'ok' | 'err' }

export interface UiState { settingsOpen: boolean; helpOpen: boolean; draftsOpen: boolean }

export interface AppState {
  mode: Mode;
  n: number;
  photos: PhotoItem[];
  text: string;
  selectedPalette: string;  // 'auto' | paletteId
  selectedFont: string;     // 'auto' | fontId
  selectedLayout: string;
  ratio: string;            // 图片比例 id（config.ratios，默认 2:3）
  aiSettings: AiSettings;
  photoAnalysis: PhotoAnalysis | null;
  cards: HTMLCanvasElement[] | null;
  cardOverrides: Record<number, PhotoItem>; // 卡片级图片覆盖（AI 生图/上传替换，session 内有效）
  textBoxes: Record<number, TextBox[]>;     // 每张卡片的可拖动文本框（导出时合并进图）
  selectedBox: { card: number; id: string } | null; // 当前选中的文本框（编辑面板）
  draftId: string | null;                   // 当前编辑会话绑定的草稿 id（防抖自动保存原位更新）
  loading: boolean;
  loadingMsg: string | null;
  exportFmt: string;
  ui: UiState;
  toasts: ToastItem[];
}

const LS_KEY = 'heal.aiSettings';

function loadAiSettings(): AiSettings {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return migrateLegacySettings(JSON.parse(s));
  } catch { /* 忽略损坏数据 */ }
  return { ...DEFAULT_AI_SETTINGS, creds: {} };
}

export function saveAiSettings(s: AiSettings): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* 隐私模式忽略 */ }
}

export const initialState: AppState = {
  mode: 'default',
  n: 3,
  photos: [],
  text: '',
  selectedPalette: 'auto',
  selectedFont: 'auto',
  selectedLayout: 'center',
  ratio: '2:3',
  aiSettings: loadAiSettings(),
  photoAnalysis: null,
  cards: null,
  cardOverrides: {},
  textBoxes: {},
  selectedBox: null,
  draftId: null,
  loading: false,
  loadingMsg: null,
  exportFmt: 'image/jpeg',
  ui: { settingsOpen: false, helpOpen: false, draftsOpen: false },
  toasts: [],
};
