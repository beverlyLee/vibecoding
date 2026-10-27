// 管理后台：场景配置各区块组件
// 全部从 admin_config 云函数读取「全局配置」(scene_config.main)，保存即对所有用户生效。
// operator 角色可查看，admin 角色可修改（保存按钮仅在 isAdmin 时渲染）。

import { useEffect, useState } from 'react';
import { View, Text, Input, Textarea, Button, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  adminGetConfig,
  adminSaveApiBase,
  adminSaveAttackCategories,
  adminSaveAttackScenes,
  adminSaveDailyLimit,
  adminSaveDailyTTL,
  adminSaveIntents,
  adminSaveModelParams,
  adminSavePresets,
  adminSavePrompts,
  adminSaveQuotes,
  adminSaveTopics,
} from '@/services/adminConfig';
import type {
  AttackScene,
  CloudSceneConfig,
  IntentRule,
  LLMPreset,
  ModelParamsMap,
  PromptsMap,
  Quote,
} from '@/types/admin';
import type { IntensityLevel } from '@/types/analysis';
import {
  DEFAULT_PROMPTS,
  DEFAULT_CRAWL_TOPICS,
  DEFAULT_MODEL_PARAMS,
  DEFAULT_DAILY_TTL_DAYS,
  DEFAULT_API_BASE,
} from '@/services/sceneConfig';
import { ATTACK_CATEGORIES, ATTACK_SCENES } from '@/data/attackScenes';
import { INTENT_RULES } from '@/data/intents';
import { QUOTES } from '@/data/quotes';
import { LLM_PRESETS } from '@/types/settings';
import styles from './index.module.scss';

const MODEL_PURPOSES = ['default', 'analyze', 'quoteGen', 'rephrase', 'test'];
const MODEL_PURPOSE_LABEL: Record<string, string> = {
  default: '全局兜底',
  analyze: '拆招分析',
  quoteGen: '语录生成',
  rephrase: '换说法',
  test: '连接测试',
};
const INTENSITIES: IntensityLevel[] = ['low', 'medium', 'high'];
const INTENSITY_LABEL: Record<string, string> = { low: '轻', medium: '中', high: '重' };
const PROTOCOLS = ['openai', 'anthropic'];

const STYLE_KEYS = ['gentle', 'humor', 'direct', 'counter'] as const;
const STYLE_LABEL: Record<string, string> = {
  gentle: '温和化解',
  humor: '幽默带过',
  direct: '直接拒绝',
  counter: '反将一军',
};

// 通用加载 hook
function useConfig<T>(selector: (c: CloudSceneConfig) => T | undefined, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminGetConfig()
      .then((cfg) => {
        if (alive) setValue((selector(cfg) as T) ?? fallback);
      })
      .catch((e: any) => Taro.showToast({ title: e?.message || '加载失败', icon: 'none' }))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { value, setValue, loading, saving, setSaving };
}

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <View>
      <Text className={styles.sectionTitle}>{title}</Text>
      {desc ? <Text className={styles.sectionDesc}>{desc}</Text> : null}
    </View>
  );
}

// 底部吸底保存栏：无论内容多长都固定在屏幕底部，避免用户以为「没有保存入口」
function SaveBar({ isAdmin, saving, onSave }: { isAdmin: boolean; saving: boolean; onSave: () => void }) {
  return (
    <View className={styles.saveFixed}>
      {isAdmin ? (
        <Button className={styles.saveBtn} loading={saving} onClick={onSave}>
          {saving ? '保存中…' : '保存修改'}
        </Button>
      ) : (
        <Text className={styles.readonlyTip}>当前角色为运营，仅管理员可保存修改</Text>
      )}
    </View>
  );
}

function splitLines(s: string): string[] {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

// ================================================================
// 意图管理
// ================================================================
// 单个意图卡片：关键词输入用本地文本态（逗号/空格/换行分隔，输入过程不被即时拆分打断）；
// 回话风格用横向 chip 切换，避免四种风格垂直铺开导致卡片过长。
function IntentCard({ rule, onChange, onRemove }: {
  rule: IntentRule;
  onChange: (next: IntentRule) => void;
  onRemove: () => void;
}) {
  // 关键词用本地文本态：输入逗号/空格时不会被受控组件即时 split 吃掉，保存时再拆分
  const [kwText, setKwText] = useState((rule.keywords || []).join('，'));
  const [activeStyle, setActiveStyle] = useState(0);

  function handleKwInput(e: any) {
    const text = e.detail.value;
    setKwText(text);
    onChange({ ...rule, keywords: splitLines(text) });
  }
  function handleResponse(text: string) {
    const responses = [...(rule.responses || [])];
    const sIdx = activeStyle;
    responses[sIdx] = {
      ...(responses[sIdx] || { style: STYLE_KEYS[sIdx], text: '', reason: '' }),
      text,
    };
    onChange({ ...rule, responses });
  }

  return (
    <View className={styles.card}>
      <View className={styles.cardHead}>
        <Input className={styles.inlineInput} value={rule.name} placeholder='意图名'
          onInput={(e) => onChange({ ...rule, name: e.detail.value })} />
        <Text className={styles.monoKey}>{rule.key}</Text>
        <Button size='mini' className={styles.delMini} onClick={onRemove}>删除</Button>
      </View>
      <Text className={styles.fieldLabel}>关键词（逗号 / 空格 / 换行分隔）</Text>
      <Textarea className={styles.textarea} value={kwText}
        placeholder='例如：结婚，找对象，谈恋爱'
        onInput={handleKwInput} />
      <View className={styles.row2}>
        <View>
          <Text className={styles.fieldLabel}>强度</Text>
          <View className={styles.chipRow}>
            {INTENSITIES.map((it) => (
              <Text key={it}
                className={[styles.chip, rule.intensity === it && styles.chipActive].filter(Boolean).join(' ')}
                onClick={() => onChange({ ...rule, intensity: it })}>{INTENSITY_LABEL[it]}</Text>
            ))}
          </View>
        </View>
        <View className={styles.flex1}>
          <Text className={styles.fieldLabel}>权重</Text>
          <Input className={styles.inlineInput} type='digit' value={String(rule.weight ?? 1)}
            onInput={(e) => onChange({ ...rule, weight: Number(e.detail.value) || 1 })} />
        </View>
      </View>
      <Text className={styles.fieldLabel}>处境说明</Text>
      <Textarea className={styles.textarea} value={rule.situation || ''}
        onInput={(e) => onChange({ ...rule, situation: e.detail.value })} />
      <Text className={styles.fieldLabel}>回话风格（点标签切换，一次编辑一种）</Text>
      <View className={styles.chipRow}>
        {STYLE_KEYS.map((s, i) => (
          <Text key={s}
            className={[styles.chip, activeStyle === i && styles.chipActive].filter(Boolean).join(' ')}
            onClick={() => setActiveStyle(i)}>{STYLE_LABEL[s]}</Text>
        ))}
      </View>
      <Textarea className={styles.textarea}
        value={(rule.responses?.[activeStyle]?.text) || ''}
        placeholder={'「' + STYLE_LABEL[STYLE_KEYS[activeStyle]] + '」风格的回话'}
        onInput={(e) => handleResponse(e.detail.value)} />
    </View>
  );
}

function IntentManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig((c) => c.intents, INTENT_RULES as IntentRule[]);

  function updateRule(idx: number, next: IntentRule) {
    setValue((prev) => prev.map((r, i) => (i === idx ? next : r)));
  }
  function addIntent() {
    const key = `custom_${Date.now()}`;
    const newRule: IntentRule = {
      key,
      name: '新意图',
      keywords: [],
      weight: 1,
      intensity: 'medium',
      situation: '',
      responses: STYLE_KEYS.map((s) => ({ style: s, text: '', reason: '' })),
    };
    setValue((prev) => [...prev, newRule]);
  }
  function removeIntent(idx: number) {
    setValue((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSave() {
    setSaving(true);
    try {
      await adminSaveIntents(value);
      Taro.showToast({ title: '意图已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='意图管理' desc='命中关键词即触发对应回话风格。新增/修改后保存即全局生效。' />
      <Button size='mini' className={styles.addBtn} onClick={addIntent}>新增意图</Button>
      {value.map((rule, idx) => (
        <IntentCard key={rule.key || idx} rule={rule}
          onChange={(next) => updateRule(idx, next)} onRemove={() => removeIntent(idx)} />
      ))}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 语录管理
// ================================================================
function QuoteManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig((c) => c.fixed_quotes, QUOTES as Quote[]);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('催婚反击');

  function removeQuote(id: string) {
    setValue(value.filter((q) => q.id !== id));
  }
  function addQuote() {
    const c = content.trim();
    if (!c) {
      Taro.showToast({ title: '请输入语录内容', icon: 'none' });
      return;
    }
    const newQuote: Quote = {
      id: `q_custom_${Date.now()}`,
      content: c,
      category: category || '催婚反击',
      note: '管理后台新增',
      source: 'fixed',
    };
    setValue([...value, newQuote]);
    setContent('');
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveQuotes(value);
      Taro.showToast({ title: '语录已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='语录管理' desc='固定语录库（Layer 1），机器人优先从这里取金句。' />
      <View className={styles.card}>
        <Text className={styles.fieldLabel}>新增语录内容</Text>
        <Textarea className={styles.textarea} value={content} onInput={(e) => setContent(e.detail.value)} />
        <Text className={styles.fieldLabel}>分类</Text>
        <Input className={styles.inlineInput} value={category} onInput={(e) => setCategory(e.detail.value)} />
        <Button size='mini' className={styles.addBtn} onClick={addQuote}>添加</Button>
      </View>
      {value.map((q) => (
        <View key={q.id} className={styles.card}>
          <View className={styles.cardHead}>
            <Text className={styles.quoteText}>{q.content}</Text>
            <Button size='mini' className={styles.delMini} onClick={() => removeQuote(q.id)}>删除</Button>
          </View>
          <Text className={styles.metaTip}>{q.category}{q.source ? ' · ' + q.source : ''}</Text>
        </View>
      ))}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 话题管理（爬虫话题）
// ================================================================
function TopicManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig((c) => c.crawl_topics, DEFAULT_CRAWL_TOPICS as string[]);
  const [topic, setTopic] = useState('');

  function removeTopic(t: string) {
    setValue(value.filter((x) => x !== t));
  }
  function addTopic() {
    const t = topic.trim();
    if (!t || value.includes(t)) return;
    setValue([...value, t]);
    setTopic('');
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveTopics(value);
      Taro.showToast({ title: '话题已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='话题管理' desc='云函数 daily_crawler 按这些话题抓取微博语录，留空则用代码默认。' />
      <View className={styles.card}>
        <Textarea className={styles.textarea} value={topic} placeholder='输入一个话题后点添加'
          onInput={(e) => setTopic(e.detail.value)} />
        <Button size='mini' className={styles.addBtn} onClick={addTopic}>添加</Button>
      </View>
      <View className={styles.chipRow}>
        {value.map((t) => (
          <Text key={t} className={styles.chipClosable} onClick={() => removeTopic(t)}>{t} ✕</Text>
        ))}
      </View>
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 模型参数
// ================================================================
function ModelParamsManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<ModelParamsMap>((c) => c.model_params, DEFAULT_MODEL_PARAMS as ModelParamsMap);

  function updatePurpose(p: string, patch: { temperature?: number; maxTokens?: number; timeout?: number }) {
    setValue({ ...value, [p]: { ...(value[p] || {}), ...patch } });
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveModelParams(value);
      Taro.showToast({ title: '模型参数已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='模型参数' desc='按调用用途分档位设置温度 / maxTokens / 超时，覆盖后每次调用 LLM 生效。' />
      {MODEL_PURPOSES.map((p) => {
        const m = value[p] || {};
        return (
          <View key={p} className={styles.card}>
            <Text className={styles.cardTitle}>{MODEL_PURPOSE_LABEL[p] || p}（{p}）</Text>
            <View className={styles.row3}>
              <View className={styles.flex1}>
                <Text className={styles.fieldLabel}>温度</Text>
                <Input className={styles.inlineInput} type='digit' value={String(m.temperature ?? '')}
                  onInput={(e) => updatePurpose(p, { temperature: Number(e.detail.value) })} />
              </View>
              <View className={styles.flex1}>
                <Text className={styles.fieldLabel}>maxTokens</Text>
                <Input className={styles.inlineInput} type='digit' value={String(m.maxTokens ?? '')}
                  onInput={(e) => updatePurpose(p, { maxTokens: Number(e.detail.value) })} />
              </View>
              <View className={styles.flex1}>
                <Text className={styles.fieldLabel}>超时(ms)</Text>
                <Input className={styles.inlineInput} type='digit' value={String(m.timeout ?? '')}
                  onInput={(e) => updatePurpose(p, { timeout: Number(e.detail.value) })} />
              </View>
            </View>
          </View>
        );
      })}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 每日参数
// ================================================================
function DailyManagement({ isAdmin }: { isAdmin: boolean }) {
  const limitHook = useConfig<number>((c) => c.daily_quote_limit, 100);
  const ttlHook = useConfig<number>((c) => c.daily_quote_ttl_days, DEFAULT_DAILY_TTL_DAYS);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    setSaving(true);
    try {
      await Promise.all([
        adminSaveDailyLimit(limitHook.value),
        adminSaveDailyTTL(ttlHook.value),
      ]);
      Taro.showToast({ title: '每日参数已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (limitHook.loading || ttlHook.loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='每日参数' desc='控制云函数 daily_crawler 每天入库上限与语录缓存过期天数。' />
      <View className={styles.card}>
        <Text className={styles.fieldLabel}>每日入库上限（条，默认 100）</Text>
        <Input className={styles.inlineInput} type='digit' value={String(limitHook.value)}
          onInput={(e) => limitHook.setValue(Number(e.detail.value) || 0)} />
        <Text className={styles.fieldLabel}>语录缓存 TTL（天，默认 7，1~30）</Text>
        <Input className={styles.inlineInput} type='digit' value={String(ttlHook.value)}
          onInput={(e) => ttlHook.setValue(Number(e.detail.value) || 0)} />
      </View>
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 后端地址
// ================================================================
function ApiBaseManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<string>((c) => c.api_base, DEFAULT_API_BASE);
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveApiBase(value.trim());
      Taro.showToast({ title: '后端地址已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;
  return (
    <View>
      <SectionHeader title='后端地址' desc='小程序/H5 数据链路打这个地址（FastAPI :8080）。公网部署填 https 地址。' />
      <View className={styles.card}>
        <Input className={styles.inlineInput} value={value} placeholder='http://localhost:8080'
          onInput={(e) => setValue(e.detail.value)} />
      </View>
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 出招场景
// ================================================================
function AttackSceneManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<AttackScene[]>((c) => c.attack_scenes, ATTACK_SCENES as AttackScene[]);

  function updateScene(idx: number, patch: Partial<AttackScene>) {
    setValue(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function updateFollowup(sceneIdx: number, fIdx: number, patch: { trigger?: string; reply?: string }) {
    setValue(
      value.map((s, i) => {
        if (i !== sceneIdx) return s;
        const followups = [...(s.followups || [])];
        followups[fIdx] = { ...followups[fIdx], ...patch };
        return { ...s, followups };
      })
    );
  }
  function addScene() {
    const newScene: AttackScene = {
      id: `scene_${Date.now()}`,
      category: '日常边界',
      title: '新场景',
      desc: '',
      openings: [''],
      followups: [{ trigger: '', reply: '' }],
    };
    setValue([...value, newScene]);
  }
  function removeScene(idx: number) {
    setValue(value.filter((_, i) => i !== idx));
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveAttackScenes(value);
      Taro.showToast({ title: '出招场景已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='出招场景' desc='主动出击话术库：开场白 + 对方反应→跟进闭环。' />
      <Button size='mini' className={styles.addBtn} onClick={addScene}>新增场景</Button>
      {value.map((scene, idx) => (
        <View key={scene.id || idx} className={styles.card}>
          <View className={styles.cardHead}>
            <Input className={styles.inlineInput} value={scene.title} placeholder='场景标题'
              onInput={(e) => updateScene(idx, { title: e.detail.value })} />
            <Button size='mini' className={styles.delMini} onClick={() => removeScene(idx)}>删除</Button>
          </View>
          <Text className={styles.fieldLabel}>分类</Text>
          <Input className={styles.inlineInput} value={scene.category}
            onInput={(e) => updateScene(idx, { category: e.detail.value })} />
          <Text className={styles.fieldLabel}>说明</Text>
          <Textarea className={styles.textarea} value={scene.desc || ''}
            onInput={(e) => updateScene(idx, { desc: e.detail.value })} />
          <Text className={styles.fieldLabel}>开场白（每行一条）</Text>
          <Textarea className={styles.textarea} value={(scene.openings || []).join('\n')}
            onInput={(e) => updateScene(idx, { openings: splitLines(e.detail.value) })} />
          <Text className={styles.fieldLabel}>谈话闭环（对方反应 → 我方跟进）</Text>
          {(scene.followups || []).map((f, fIdx) => (
            <View key={fIdx} className={styles.subCard}>
              <Text className={styles.subTitle}>第 {fIdx + 1} 轮</Text>
              <Textarea className={styles.textarea} value={f.trigger} placeholder='对方可能说'
                onInput={(e) => updateFollowup(idx, fIdx, { trigger: e.detail.value })} />
              <Textarea className={styles.textarea} value={f.reply} placeholder='我方跟进'
                onInput={(e) => updateFollowup(idx, fIdx, { reply: e.detail.value })} />
            </View>
          ))}
        </View>
      ))}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 出招分类
// ================================================================
function AttackCategoryManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<string[]>((c) => c.attack_categories, ATTACK_CATEGORIES as string[]);
  const [cat, setCat] = useState('');
  function removeCat(c: string) {
    setValue(value.filter((x) => x !== c));
  }
  function addCat() {
    const c = cat.trim();
    if (!c || value.includes(c)) return;
    setValue([...value, c]);
    setCat('');
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSaveAttackCategories(value);
      Taro.showToast({ title: '分类已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;
  return (
    <View>
      <SectionHeader title='出招分类' desc='出招场景的分类标签，第一个必须为「全部」。' />
      <View className={styles.card}>
        <Textarea className={styles.textarea} value={cat} placeholder='输入分类后点添加'
          onInput={(e) => setCat(e.detail.value)} />
        <Button size='mini' className={styles.addBtn} onClick={addCat}>添加</Button>
      </View>
      <View className={styles.chipRow}>
        {value.map((c) => (
          <Text key={c} className={styles.chipClosable} onClick={() => removeCat(c)}>{c} ✕</Text>
        ))}
      </View>
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// LLM 预设
// ================================================================
function PresetManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<LLMPreset[]>((c) => c.presets, LLM_PRESETS as LLMPreset[]);

  function updatePreset(idx: number, patch: Partial<LLMPreset>) {
    setValue(value.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPreset() {
    const newPreset: LLMPreset = {
      key: `custom_${Date.now()}`,
      name: '新预设',
      protocol: 'openai',
      baseURL: '',
      model: '',
      keyUrl: '',
      note: '',
    };
    setValue([...value, newPreset]);
  }
  function removePreset(idx: number) {
    setValue(value.filter((_, i) => i !== idx));
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSavePresets(value);
      Taro.showToast({ title: '预设已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='LLM 预设' desc='公开配置（不含 API Key），用户可在设置页选这些厂商。' />
      <Button size='mini' className={styles.addBtn} onClick={addPreset}>新增预设</Button>
      {value.map((p, idx) => (
        <View key={p.key || idx} className={styles.card}>
          <View className={styles.cardHead}>
            <Input className={styles.inlineInput} value={p.name} placeholder='展示名'
              onInput={(e) => updatePreset(idx, { name: e.detail.value })} />
            <Button size='mini' className={styles.delMini} onClick={() => removePreset(idx)}>删除</Button>
          </View>
          <View className={styles.cardHead}>
            <Text className={styles.fieldLabel}>协议</Text>
            <Picker mode='selector' range={PROTOCOLS}
              onChange={(e) => updatePreset(idx, { protocol: PROTOCOLS[Number(e.detail.value)] as any })}>
              <View className={styles.pickerBox}><Text>{p.protocol}</Text></View>
            </Picker>
          </View>
          <Text className={styles.fieldLabel}>baseURL</Text>
          <Input className={styles.inlineInput} value={p.baseURL}
            onInput={(e) => updatePreset(idx, { baseURL: e.detail.value })} />
          <Text className={styles.fieldLabel}>model</Text>
          <Input className={styles.inlineInput} value={p.model}
            onInput={(e) => updatePreset(idx, { model: e.detail.value })} />
          <Text className={styles.fieldLabel}>keyUrl</Text>
          <Input className={styles.inlineInput} value={p.keyUrl}
            onInput={(e) => updatePreset(idx, { keyUrl: e.detail.value })} />
          <Text className={styles.fieldLabel}>note</Text>
          <Textarea className={styles.textarea} value={p.note || ''}
            onInput={(e) => updatePreset(idx, { note: e.detail.value })} />
        </View>
      ))}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

// ================================================================
// 提示词
// ================================================================
function PromptManagement({ isAdmin }: { isAdmin: boolean }) {
  const { value, setValue, loading, saving, setSaving } = useConfig<PromptsMap>((c) => c.prompts, DEFAULT_PROMPTS as PromptsMap);
  const keys = Object.keys(DEFAULT_PROMPTS);

  function updatePrompt(k: string, v: string) {
    setValue({ ...value, [k]: v });
  }
  async function onSave() {
    setSaving(true);
    try {
      await adminSavePrompts(value);
      Taro.showToast({ title: '提示词已保存', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Text className={styles.emptyTip}>加载中…</Text>;

  return (
    <View>
      <SectionHeader title='系统提示词' desc='覆盖各用途的 LLM system prompt；留空则用代码默认。' />
      {keys.map((k) => (
        <View key={k} className={styles.card}>
          <Text className={styles.cardTitle}>{k}</Text>
          <Textarea className={styles.textarea} value={value[k] || ''} placeholder='（未覆盖，使用代码默认）'
            onInput={(e) => updatePrompt(k, e.detail.value)} />
        </View>
      ))}
      <SaveBar isAdmin={isAdmin} saving={saving} onSave={onSave} />
    </View>
  );
}

export {
  IntentManagement,
  QuoteManagement,
  TopicManagement,
  ModelParamsManagement,
  DailyManagement,
  ApiBaseManagement,
  AttackSceneManagement,
  AttackCategoryManagement,
  PresetManagement,
  PromptManagement,
};
