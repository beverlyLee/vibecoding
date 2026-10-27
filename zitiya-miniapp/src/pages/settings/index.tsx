import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { LLMConfig, LLMPreset } from '@/types/settings';
import { getLLMPresets, getAsrPresets } from '@/services/sceneConfig';
import { testConnection, testAsrConnection } from '@/services/llm';
import type { TestResult } from '@/services/llm';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/store/useUserStore';
import { useLoginSheet } from '@/hooks/useLoginSheet';
import styles from './index.module.scss';

// 功能区：语言处理（拆招/出招话术）与 语音识别（录音转文字）
// HIDE_ASR: 语音识别暂时下线，等可测试时恢复
const HIDE_ASR = true;
type SectionKind = 'lang' | 'asr';

interface Draft {
  baseURL: string;
  apiKey: string;
  model: string;
  asrModel: string;
}

const SECTION_META: Record<SectionKind, { title: string; emptyHint: string }> = {
  lang: { title: '🧠 语言处理模型（拆招 · 出招）', emptyHint: '内置规则引擎' },
  asr: { title: '🎙️ 语音识别模型（录音转文字）', emptyHint: '自动选择 / 浏览器识别' }
};

// 设置页：按功能分别配置语言处理模型与语音识别模型
export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const saveLLMConfig = useAppStore((s) => s.saveLLMConfig);
  const setActiveLLM = useAppStore((s) => s.setActiveLLM);
  const setActiveAsr = useAppStore((s) => s.setActiveAsr);
  const requireLogin = useUserStore((s) => s.requireLogin);
  const loginSheet = useLoginSheet();

  // 展开的卡片 id（kind:key）
  const [expandedId, setExpandedId] = useState<string>('');
  // 表单草稿（按厂商 key 共享，两个功能区编辑同一份配置）
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // 测试中 / 测试结果（按 kind:key）
  const [testingId, setTestingId] = useState<string>('');
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  // 顶部状态卡：当前启用配置的一键测试
  const [statusTesting, setStatusTesting] = useState<'' | SectionKind>('');
  const [statusResults, setStatusResults] = useState<Partial<Record<SectionKind, TestResult>>>({});

  const langActive = settings.activeKey ? settings.configs[settings.activeKey] : null;
  const asrActive = settings.activeAsrKey ? settings.configs[settings.activeAsrKey] : null;

  const getDraft = (cfg: LLMConfig): Draft => {
    return (
      drafts[cfg.key] || {
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        model: cfg.model,
        asrModel: cfg.asrModel || ''
      }
    );
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const cfg = useAppStore.getState().settings.configs[key];
      const base = prev[key] || {
        baseURL: cfg?.baseURL || '',
        apiKey: cfg?.apiKey || '',
        model: cfg?.model || '',
        asrModel: cfg?.asrModel || ''
      };
      return { ...prev, [key]: { ...base, ...patch } };
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? '' : id));
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSave = (kind: SectionKind, key: string) => {
    if (!requireLogin('保存配置')) return;
    const cfg = settings.configs[key];
    const draft = getDraft(cfg);
    if (!draft.apiKey.trim() && key !== 'custom') {
      Taro.showToast({ title: '请先填写 API Key', icon: 'none' });
      return;
    }
    if (key === 'custom' && (!draft.baseURL.trim() || (kind === 'lang' && !draft.model.trim()))) {
      Taro.showToast({ title: kind === 'lang' ? '自定义配置需填写地址和模型名' : '自定义配置需填写接口地址', icon: 'none' });
      return;
    }
    saveLLMConfig({
      ...cfg,
      baseURL: draft.baseURL.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim() || cfg.model,
      asrModel: draft.asrModel.trim() || cfg.asrModel
    });
    Taro.showToast({ title: '已保存', icon: 'success', duration: 1200 });
    console.log('[Settings] 已保存配置:', kind, key);
  };

  const handleTest = async (kind: SectionKind, key: string) => {
    if (!requireLogin('测试连接')) return;
    const cfg = settings.configs[key];
    const draft = getDraft(cfg);
    if (!draft.apiKey.trim()) {
      Taro.showToast({ title: '请先填写 API Key', icon: 'none' });
      return;
    }
    const id = `${kind}:${key}`;
    const testCfg: LLMConfig = {
      ...cfg,
      baseURL: draft.baseURL.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim() || cfg.model,
      asrModel: draft.asrModel.trim() || cfg.asrModel
    };
    setTestingId(id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const result = kind === 'lang' ? await testConnection(testCfg) : await testAsrConnection(testCfg);
    setTestResults((prev) => ({ ...prev, [id]: result }));
    setTestingId('');
    // 测试连通的配置自动缓存到本地存储，刷新/重开后无需重新填写
    if (result.ok) {
      saveLLMConfig(testCfg);
      console.log('[Settings] 测试连通，已自动缓存配置:', key, cfg.name);
    }
  };

  // 顶部状态卡一键测试：测当前启用（或自动选择）的配置
  const handleStatusTest = async (kind: SectionKind) => {
    if (!requireLogin('测试连接')) return;
    if (statusTesting) return;
    const cfg = kind === 'lang' ? (langActive && langActive.apiKey ? langActive : null) : useAppStore.getState().getAsrLLM();
    if (!cfg) {
      Taro.showToast({
        title: kind === 'lang' ? '当前是内置规则引擎，无需测试' : '尚未配置任何语音识别模型',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    console.log('[Settings] 状态卡测试:', kind, cfg.name);
    setStatusTesting(kind);
    setStatusResults((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    const result = kind === 'lang' ? await testConnection(cfg) : await testAsrConnection(cfg);
    setStatusResults((prev) => ({ ...prev, [kind]: result }));
    setStatusTesting('');
  };

  const handleUse = (kind: SectionKind, key: string) => {
    if (!requireLogin('启用模型')) return;
    if (kind === 'lang') {
      setActiveLLM(key);
      Taro.showToast({ title: '已启用该语言模型', icon: 'success', duration: 1200 });
    } else {
      setActiveAsr(key);
      Taro.showToast({ title: '已启用该识别模型', icon: 'success', duration: 1200 });
    }
  };

  const handleStop = (kind: SectionKind) => {
    if (!requireLogin('停用模型')) return;
    if (kind === 'lang') {
      setActiveLLM('');
      Taro.showToast({ title: '已停用语言模型', icon: 'none', duration: 1200 });
    } else {
      setActiveAsr('');
      Taro.showToast({ title: '已停用识别模型', icon: 'none', duration: 1200 });
    }
  };

  // 渲染一个功能区
  const renderSection = (kind: SectionKind, presets: LLMPreset[]) => {
    const activeKey = kind === 'lang' ? settings.activeKey : settings.activeAsrKey;
    return (
      <View key={kind}>
        <Text className={styles.sectionTitle}>{SECTION_META[kind].title}</Text>
        {presets.map((preset) => {
          const cfg = settings.configs[preset.key];
          if (!cfg) return null;
          const draft = getDraft(cfg);
          const id = `${kind}:${preset.key}`;
          const isOpen = expandedId === id;
          const isActive = activeKey === preset.key && Boolean(cfg.apiKey);
          const testResult = testResults[id];
          const modelLabel = kind === 'lang' ? '模型名称' : '识别模型名称';
          const modelValue = kind === 'lang' ? draft.model : draft.asrModel;
          const modelPlaceholder =
            kind === 'lang' ? preset.model || '如 deepseek-chat' : preset.asrModel || '如 whisper-1';
          return (
            <View key={id} className={styles.vendorCard}>
              <View className={styles.vendorHeader} onClick={() => toggleExpand(id)}>
                <View className={styles.vendorIcon}>{kind === 'lang' ? '🧠' : '🎙️'}</View>
                <View className={styles.vendorInfo}>
                  <View className={styles.vendorNameRow}>
                    <Text className={styles.vendorName}>{preset.name}</Text>
                    {isActive && <Text className={styles.activeBadge}>使用中</Text>}
                  </View>
                  <Text className={styles.vendorMeta}>
                    {cfg.apiKey
                      ? `已配置 · ${(kind === 'lang' ? draft.model || cfg.model : draft.asrModel || cfg.asrModel) || '未设置模型'}`
                      : preset.note}
                  </Text>
                </View>
                <Text className={[styles.expandArrow, isOpen && styles.expandArrowOpen].filter(Boolean).join(' ')}>▾</Text>
              </View>

              {isOpen && (
                <View className={styles.form}>
                  {/* 隐私安心提示：配置不上传服务器 */}
                  <View className={styles.privacyTip}>
                    <Text className={styles.privacyTipText}>🔒 你的 API Key 与配置仅保存在本机，不会上传任何服务器，请放心使用</Text>
                  </View>

                  <View className={styles.field}>
                    <Text className={styles.fieldLabel}>API Key</Text>
                    <Input
                      className={styles.fieldInput}
                      password
                      value={draft.apiKey}
                      placeholder={preset.key === 'custom' ? 'sk-… 或令牌' : '粘贴你的 API Key'}
                      placeholderClass={styles.fieldTip}
                      onInput={(e) => updateDraft(preset.key, { apiKey: e.detail.value })}
                    />
                    {preset.keyUrl && <Text className={styles.fieldTip}>获取地址：{preset.keyUrl}</Text>}
                  </View>

                  <View className={styles.field}>
                    <Text className={styles.fieldLabel}>接口地址（Base URL）</Text>
                    <Input
                      className={styles.fieldInput}
                      value={draft.baseURL}
                      placeholder="https://…"
                      placeholderClass={styles.fieldTip}
                      onInput={(e) => updateDraft(preset.key, { baseURL: e.detail.value })}
                    />
                  </View>

                  <View className={styles.field}>
                    <Text className={styles.fieldLabel}>{modelLabel}</Text>
                    <Input
                      className={styles.fieldInput}
                      value={modelValue}
                      placeholder={modelPlaceholder}
                      placeholderClass={styles.fieldTip}
                      onInput={(e) =>
                        updateDraft(preset.key, kind === 'lang' ? { model: e.detail.value } : { asrModel: e.detail.value })
                      }
                    />
                  </View>

                  {testResult && (
                    <View className={[styles.testResult, testResult.ok ? styles.testOk : styles.testFail].filter(Boolean).join(' ')}>
                      {testResult.message}
                    </View>
                  )}

                  <View className={styles.formActions}>
                    <Button
                      className={[styles.formBtn, testingId === id && styles.testing].filter(Boolean).join(' ')}
                      disabled={testingId === id}
                      onClick={() => handleTest(kind, preset.key)}
                    >
                      {testingId === id ? '测试中…' : kind === 'lang' ? '测试连接' : '测试识别接口'}
                    </Button>
                    <Button className={[styles.formBtn, styles.saveBtn].filter(Boolean).join(' ')} onClick={() => handleSave(kind, preset.key)}>
                      保存
                    </Button>
                    {isActive ? (
                      <Button className={[styles.formBtn, styles.stopBtn].filter(Boolean).join(' ')} onClick={() => handleStop(kind)}>
                        停用
                      </Button>
                    ) : (cfg.apiKey && (
                      <Button className={[styles.formBtn, styles.useBtn].filter(Boolean).join(' ')} onClick={() => handleUse(kind, preset.key)}>
                        启用
                      </Button>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <View className={styles.page}>
        {/* 已填 Key 但没启用的提示 */}
        {!settings.activeKey && Object.values(settings.configs).some(c => c.apiKey && c.key !== 'custom') && (
          <View style={{
            background: '#FFF8E1', borderLeft: '4px solid #FF9800',
            padding: '16rpx 24rpx', marginBottom: '16rpx', borderRadius: '0 12rpx 12rpx 0',
            display: 'flex', alignItems: 'center', gap: '12rpx'
          }}>
            <Text style={{ fontSize: '28rpx' }}>💡 已保存 API Key，记得在卡片上点「启用」才会生效哦～</Text>
          </View>
        )}

        {/* 当前配置状态 */}
        <View className={styles.statusCard}>
          <View className={styles.statusLeft}>
            <Text className={styles.statusLabel}>语言处理模型</Text>
            <Text className={styles.statusValue}>{langActive && langActive.apiKey ? `🧠 ${langActive.name}` : '🦆 内置规则引擎'}</Text>
            <Text className={styles.statusDesc}>
              {langActive && langActive.apiKey ? '意图识别与回话由大模型生成' : '本地关键词识别，配置大模型后更聪明'}
            </Text>
            {statusResults.lang && (
              <View className={[styles.testResult, statusResults.lang.ok ? styles.testOk : styles.testFail].filter(Boolean).join(' ')}>
                {statusResults.lang.message}
              </View>
            )}
            {!HIDE_ASR && (
              <>
                <Text className={styles.statusLabel} style={{ marginTop: '24rpx' }}>语音识别模型</Text>
                <Text className={styles.statusValue}>{asrActive && asrActive.apiKey ? `🎙️ ${asrActive.name}` : '🦆 自动选择'}</Text>
                <Text className={styles.statusDesc}>
                  {asrActive && asrActive.apiKey
                    ? `录音转写走 ${asrActive.name} 音频接口`
                    : '优先浏览器实时识别，失败时自动用已配置的音频厂商'}
                </Text>
                {statusResults.asr && (
                  <View className={[styles.testResult, statusResults.asr.ok ? styles.testOk : styles.testFail].filter(Boolean).join(' ')}>
                    {statusResults.asr.message}
                  </View>
                )}
              </>
            )}
          </View>
          <View>
            <Button
              className={[styles.formBtn, statusTesting === 'lang' && styles.testing].filter(Boolean).join(' ')}
              onClick={() => handleStatusTest('lang')}
              disabled={statusTesting === 'lang'}
            >
              {statusTesting === 'lang' ? '测试中…' : '测试语言模型'}
            </Button>
            {!HIDE_ASR && (
              <>
                <Button
                  className={[styles.formBtn, statusTesting === 'asr' && styles.testing].filter(Boolean).join(' ')}
                  style={{ marginTop: '16rpx' }}
                  onClick={() => handleStatusTest('asr')}
                  disabled={statusTesting === 'asr'}
                >
                  {statusTesting === 'asr' ? '测试中…' : '测试识别模型'}
                </Button>
                {asrActive && asrActive.apiKey && (
                  <Button className={styles.disableBtn} style={{ marginTop: '16rpx' }} onClick={() => setActiveAsr('')}>
                    恢复自动选择
                  </Button>
                )}
              </>
            )}
            {langActive && langActive.apiKey && (
              <Button className={styles.disableBtn} style={{ marginTop: '16rpx' }} onClick={() => setActiveLLM('')}>
                切回规则引擎
              </Button>
            )}
          </View>
        </View>

        {renderSection('lang', getLLMPresets())}
        {!HIDE_ASR && renderSection('asr', getAsrPresets())}

        {/* 说明 */}
        <View className={styles.notes}>
          <Text className={styles.noteItem}>· 语言处理模型用于拆招/出招的意图识别与话术生成；未配置时自动降级为内置规则引擎</Text>
          {!HIDE_ASR && (
            <>
              <Text className={styles.noteItem}>· 语音识别模型用于录音转文字；浏览器实时识别失败时自动走该模型的云端音频接口</Text>
              <Text className={styles.noteItem}>· 推荐组合：火山引擎（对话）+ 硅基流动（免费语音识别），两个 Key 各自保存启用即可</Text>
            </>
          )}
          <Text className={styles.noteItem}>· 小程序正式环境中，需在各平台后台将厂商域名加入 request 合法域名</Text>
          <Text className={styles.noteItem}>· H5 预览时部分厂商接口可能存在跨域限制，建议优先使用国内厂商</Text>
        </View>
      </View>
      {loginSheet}
    </>
  );
}
