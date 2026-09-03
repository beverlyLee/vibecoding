import { useCallback } from 'react';
import { config } from '@engine/config';
import { compose } from '@engine';
import { useApp } from '@ui/store/AppContext';
import type { PhotoItem } from '@ui/store/state';

export function validateFile(f: File): boolean {
  if (config.input.accept.indexOf(f.type) < 0) return false;
  if (f.size > config.input.maxFileSize) return false;
  return true;
}

export function readImage(file: File): Promise<PhotoItem> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const prepared = compose.prepareImage(img);
      // 512px 缩略 dataURL（供 AI 模式）
      const dmax = 512;
      const r = dmax / Math.max(img.naturalWidth, img.naturalHeight);
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.round(img.naturalWidth * r));
      tmp.height = Math.max(1, Math.round(img.naturalHeight * r));
      tmp.getContext('2d')!.drawImage(img, 0, 0, tmp.width, tmp.height);
      res({ file, url, img: prepared, dataUrl: tmp.toDataURL('image/jpeg', 0.8), raw: img });
    };
    img.onerror = () => rej(new Error('load fail'));
    img.src = url;
  });
}

/* dataURL → PhotoItem（AI 生成图/覆盖图用） */
export async function readImageFromDataUrl(dataUrl: string): Promise<PhotoItem> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  return readImage(new File([blob], `ai-image.${ext}`, { type: blob.type }));
}

export function usePhotos() {
  const { state, dispatch, toast } = useApp();

  const addFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => {
      const ok = validateFile(f);
      if (!ok) toast(f.size > config.input.maxFileSize ? '文件超过 10MB，已忽略：' + f.name : '已忽略非图片文件：' + f.name, 'err');
      return ok;
    });
    if (!files.length) return;
    const loaded: PhotoItem[] = [];
    for (const f of files) {
      try { loaded.push(await readImage(f)); }
      catch { toast('图片读取失败：' + f.name, 'err'); }
    }
    if (!loaded.length) return;
    if (state.mode === 'default') {
      // 旧照片先 revoke，再由 reducer 替换为第一张
      state.photos.forEach(p => URL.revokeObjectURL(p.url));
    }
    dispatch({ type: 'ADD_PHOTOS', photos: loaded });
  }, [state.mode, state.photos, dispatch, toast]);

  const removePhoto = useCallback((index: number) => {
    const p = state.photos[index];
    if (p) URL.revokeObjectURL(p.url);
    dispatch({ type: 'REMOVE_PHOTO', index });
  }, [state.photos, dispatch]);

  return { photos: state.photos, addFiles, removePhoto };
}
