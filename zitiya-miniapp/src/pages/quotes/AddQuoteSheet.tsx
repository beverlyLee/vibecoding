import React, { useState } from 'react';
import { View, Text, Input, Textarea, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { Quote } from '@/data/quotes';
import { QUOTE_CATEGORIES } from '@/data/quotes';
import { userQuotesAdd, userQuotesRemove, userQuotesUpdate } from '@/services/userQuotes';
import { invalidateUserQuotes } from '@/services/sceneConfig';
import styles from './index.module.scss';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (quote: Quote) => void;
  /** 有值 → 编辑态；undefined → 新增态 */
  editingQuote?: Quote | null;
}

// 过滤掉「全部」作为可选项分类
const CATEGORY_OPTIONS = QUOTE_CATEGORIES.filter((c) => c !== '全部');

/**
 * 底部弹层：新增 / 编辑 我的语录
 * - editingQuote 为空 → 新增模式
 * - editingQuote 有值 → 编辑模式，提交调 update
 */
export default function AddUserQuoteSheet({ visible, onClose, onSaved, editingQuote }: Props) {
  const isEdit = !!editingQuote?.id;
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0] || '自定义');
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 每次打开：重置 or 回填
  React.useEffect(() => {
    if (visible) {
      if (editingQuote?.id) {
        // 编辑态 → 回填
        const q = editingQuote;
        setContent(q.content || '');
        // 分类：若是预设选项就直接选，否则填到 customCategory
        if (CATEGORY_OPTIONS.includes(q.category)) {
          setCategory(q.category);
          setCustomCategory('');
        } else {
          setCategory(CATEGORY_OPTIONS[0] || '自定义');
          setCustomCategory(q.category || '');
        }
        setNote(q.note || '');
        setKeywords(q.keywords ? [...q.keywords] : []);
      } else {
        // 新增态 → 重置
        setContent('');
        setCategory(CATEGORY_OPTIONS[0] || '自定义');
        setCustomCategory('');
        setNote('');
        setKeywords([]);
      }
      setKeywordInput('');
      setSaving(false);
      setDeleting(false);
    }
  }, [visible, editingQuote?.id]);

  if (!visible) return null;

  // 加关键词
  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (keywords.includes(kw)) {
      setKeywordInput('');
      return;
    }
    if (keywords.length >= 10) {
      Taro.showToast({ title: '最多 10 个关键词', icon: 'none' });
      return;
    }
    setKeywords([...keywords, kw]);
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  const handleSave = async () => {
    const text = content.trim();
    if (!text) {
      Taro.showToast({ title: '请输入语录内容', icon: 'none' });
      return;
    }
    if (text.length < 4) {
      Taro.showToast({ title: '内容太短啦', icon: 'none' });
      return;
    }
    if (saving) return;

    const finalCategory = customCategory.trim() || category;
    setSaving(true);
    try {
      let saved: Quote;
      if (isEdit && editingQuote?.id) {
        console.log('[AddQuoteSheet] → userQuotesUpdate, id=', editingQuote.id, 'keys=', Object.keys(editingQuote));
        saved = await userQuotesUpdate(editingQuote.id, {
          content: text,
          category: finalCategory,
          note: note.trim(),
          keywords,
        });
        console.log('[AddQuoteSheet] ← userQuotesUpdate 成功, 返回 id=', saved.id);
      } else {
        saved = await userQuotesAdd({
          content: text,
          category: finalCategory,
          note: note.trim(),
          keywords,
        });
      }
      invalidateUserQuotes();
      Taro.showToast({ title: isEdit ? '已更新 ✨' : '已保存 ✨', icon: 'success' });
      onSaved(saved);
    } catch (err: any) {
      Taro.showToast({ title: err?.message || (isEdit ? '更新失败' : '保存失败'), icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !editingQuote?.id) return;
    if (deleting) return;

    const confirmed = await new Promise<boolean>((resolve) => {
      Taro.showModal({
        title: '删除这条语录？',
        content: '删了就找不回来啦',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await userQuotesRemove(editingQuote.id);
      invalidateUserQuotes();
      Taro.showToast({ title: '已删除', icon: 'success' });
      // 传 null 告诉外面删除了
      onSaved(null as unknown as Quote);
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '删除失败', icon: 'none' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View className={styles.sheetMask} onClick={onClose}>
      <View className={styles.sheetCard} onClick={(e) => e.stopPropagation()}>
        <View className={styles.sheetHeader}>
          <Text className={styles.sheetTitle}>
            {isEdit ? '✏️ 编辑我的语录' : '✨ 添加我的语录'}
          </Text>
          <Text className={styles.sheetClose} onClick={onClose}>✕</Text>
        </View>

        {/* 语录内容 */}
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>语录内容 *（4–500 字）</Text>
          <Textarea
            className={styles.formTextarea}
            placeholder='什么时候、说什么话、怎么回怼/怎么接话…'
            value={content}
            maxlength={500}
            autoHeight
            onInput={(e) => setContent(e.detail.value)}
          />
          <Text className={[styles.formCount, content.length > 0 && content.length < 4 ? styles.formCountWarn : ''].join(' ')}>
            {content.length}/500 {content.length > 0 && content.length < 4 ? '（至少 4 字）' : ''}
          </Text>
        </View>

        {/* 分类选择 */}
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>场景分类</Text>
          <ScrollView scrollX className={styles.formChips} enhanced showScrollbar={false}>
            {CATEGORY_OPTIONS.map((c) => (
              <Text
                key={c}
                className={[
                  styles.formChip,
                  category === c && !customCategory ? styles.formChipActive : '',
                ].join(' ')}
                onClick={() => {
                  setCategory(c);
                  setCustomCategory('');
                }}
              >
                {c}
              </Text>
            ))}
          </ScrollView>
          <Input
            className={styles.formInput}
            placeholder='或自定义分类名…'
            value={customCategory}
            maxlength={30}
            onInput={(e) => setCustomCategory(e.detail.value)}
          />
        </View>

        {/* 备注 */}
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>备注说明（选填）</Text>
          <Input
            className={styles.formInput}
            placeholder='用在什么场景、适用对象…'
            value={note}
            maxlength={200}
            onInput={(e) => setNote(e.detail.value)}
          />
        </View>

        {/* 关键词 */}
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>关键词（选填，用于拆招时匹配）</Text>
          <View className={styles.formKeywordInputRow}>
            <Input
              className={styles.formInputKeyword}
              placeholder='回车添加关键词'
              value={keywordInput}
              maxlength={20}
              confirmType='done'
              onConfirm={addKeyword}
              onInput={(e) => setKeywordInput(e.detail.value)}
            />
            <Text className={styles.formKeywordAdd} onClick={addKeyword}>添加</Text>
          </View>
          {keywords.length > 0 && (
            <View className={styles.formKeywordTags}>
              {keywords.map((kw) => (
                <Text key={kw} className={styles.formKeywordTag} onClick={() => removeKeyword(kw)}>
                  {kw} ✕
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* 按钮 */}
        <View className={styles.sheetActions}>
          {isEdit && (
            <Text
              className={[styles.sheetDelete, deleting ? styles.sheetDeleteDisabled : ''].join(' ')}
              onClick={handleDelete}
            >
              {deleting ? '删除中…' : '🗑 删除'}
            </Text>
          )}
          <Text className={styles.sheetCancel} onClick={onClose}>取消</Text>
          <Text
            className={[styles.sheetSave, saving ? styles.sheetSaveDisabled : ''].join(' ')}
            onClick={handleSave}
          >
            {saving ? '保存中…' : isEdit ? '更新 ✏️' : '保存 ✨'}
          </Text>
        </View>
      </View>
    </View>
  );
}
