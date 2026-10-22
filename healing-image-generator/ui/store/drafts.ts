/* ui/store/drafts.ts · 草稿箱持久层（IndexedDB）
   存「文案 + 全部设置 + 原图 Blob + 单卡覆盖图 + 文本框」：IDB 支持 Blob 长期存储且容量远大于 localStorage，
   恢复时经 readImage 还原为全分辨率 PhotoItem。无旧 localStorage 草稿时自动迁移。 */

import type { TextBox } from '@engine/compose';

export interface DraftPhoto { name: string; type: string; blob: Blob }

/* 单卡覆盖图（AI 生图/上传替换），按卡片索引存储 */
export interface DraftOverride extends DraftPhoto { index: number }

export interface Draft {
  id: string;
  title: string;            // 文案首行预览（≤16 字）
  text: string;
  mode: 'default' | 'multi';
  n: number;
  selectedPalette: string;
  selectedFont: string;
  selectedLayout: string;
  ratio?: string;           // 图片比例（旧草稿缺省 2:3）
  savedAt: number;
  photos: DraftPhoto[];
  overrides?: DraftOverride[];
  textBoxes?: Record<number, TextBox[]>;
}

export type DraftData = Omit<Draft, 'id' | 'title' | 'savedAt'>;

const DB_NAME = 'heal-drafts';
const STORE = 'drafts';
const MAX_DRAFTS = 20;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error ?? new Error('idb open fail'));
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error('idb fail'));
  }));
}

/* 首次调用时迁移旧 localStorage 草稿（无照片），迁移后移除 LS key */
async function migrateOnce(): Promise<void> {
  const raw = localStorage.getItem('heal.drafts');
  if (!raw) return;
  localStorage.removeItem('heal.drafts');
  try {
    const old: Draft[] = JSON.parse(raw);
    if (!Array.isArray(old)) return;
    for (const d of old) {
      if (d && typeof d.id === 'string') await tx('readwrite', s => s.put({ ...d, photos: d.photos ?? [] }));
    }
  } catch { /* 旧数据损坏则放弃 */ }
}

export async function loadDrafts(): Promise<Draft[]> {
  try {
    await migrateOnce();
    const all = await tx<Draft[]>('readonly', s => s.getAll() as IDBRequest<Draft[]>);
    return all.filter(d => d && typeof d.id === 'string').sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try { await tx('readwrite', s => s.delete(id)); } catch { /* 忽略 */ }
}

/* 新建或更新（有 draftId 则原位更新）；文案为空不保存返回 null；超上限淘汰最旧 */
export async function upsertDraft(draftId: string | null, data: DraftData): Promise<Draft | null> {
  const text = data.text.trim();
  if (!text) return null;
  try {
    await migrateOnce();
    const drafts = await loadDrafts();
    const title = text.split('\n')[0].trim().slice(0, 16) || '未命名草稿';
    const existing = draftId ? drafts.find(d => d.id === draftId) : undefined;
    const draft: Draft = existing
      ? { ...existing, ...data, title, savedAt: Date.now() }
      : { ...data, id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, title, savedAt: Date.now() };
    const next = [draft, ...drafts.filter(d => d.id !== draft.id)]
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_DRAFTS);
    for (const d of next) await tx('readwrite', s => s.put(d));
    for (const d of drafts) if (!next.find(n => n.id === d.id)) await tx('readwrite', s => s.delete(d.id));
    return draft;
  } catch {
    return null;
  }
}
