import React, { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import InputPanel from '@/components/InputPanel';
import IntentCard from '@/components/IntentCard';
import ResponseCard from '@/components/ResponseCard';
import EmptyState from '@/components/EmptyState';
import { analyzeUtterance, rephraseResponse, copyText } from '@/services/engine';
import { useAppStore } from '@/store/useAppStore';
import type { AnalysisResult, Response } from '@/types/analysis';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';

// 按 result.source 给出页面提示
function showSourceToast(source: string) {
  switch (source) {
    case 'rule':
    case 'llm':
      // 正常命中，静默
      break;
    case 'fallback':
      // LLM 配了但调失败
      Taro.showToast({ title: 'AI 暂不可用，已用兜底话术', icon: 'none', duration: 2000 });
      break;
    case 'fallback_no_llm':
      // 规则库没匹配到 + 没配 LLM —— 引导去配置
      Taro.showModal({
        title: '默认规则库没匹配到',
        content: '可以在设置里配置你的大模型，开启后能识别更多场景并生成更贴切的回话。',
        confirmText: '去设置',
        cancelText: '算了',
        success: (res) => {
          if (res.confirm) {
            Taro.switchTab({ url: '/pages/settings/index' });
          }
        },
      });
      break;
  }
}

// 拆招页：输入原话 → 自动分析 → 多套回话
export default function DefendPage() {
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rephrasingId, setRephrasingId] = useState<string | null>(null);
  const activeLLM = useAppStore((s) => s.getActiveLLM());
  const clearPendingQuote = useAppStore((s) => s.clearPendingQuote);

  // 页面显示时检查语录回填
  useDidShow(() => {
    const quote = useAppStore.getState().pendingQuote;
    if (quote) {
      console.log('[API] DefendPage.useDidShow ← 检测到语录回填:', quote.slice(0, 40));
      setInputText(quote);
      runAnalyze(quote, '语录回填');
      clearPendingQuote();
    }
  });

  // 只在点击"帮我接话"按钮时触发分析，打字期间不自动执行

  const runAnalyze = async (text: string, source: string = '手动点击') => {
    if (!text.trim()) return;
    setAnalyzing(true);
    try {
      console.log(`[API] DefendPage.runAnalyze(${source}) ← 开始, ${text.length}字:`, text.slice(0, 40));
      const res = await analyzeUtterance(text);
      setResult(res);
      console.log(`[API] DefendPage.runAnalyze(${source}) ✔ 完成, 意图「${res.intent}」, 来源 ${res.source}, 耗时 ${res.costMs}ms`);
      showSourceToast(res.source);
    } catch (err) {
      console.error(`[API] DefendPage.runAnalyze(${source}) ✘ 失败:`, err);
      Taro.showToast({ title: '分析出错了，再试一次', icon: 'none' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = () => {
    const text = inputText.trim();
    console.log('[API] DefendPage.handleSubmit ← 「帮我接话」点击, 文字长度 =', text.length);
    if (!text) return;
    runAnalyze(text, '点击帮我接话');
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) Taro.showToast({ title: '已复制，拿去用吧', icon: 'success', duration: 1200 });
  };

  const handleRephrase = async (response: Response) => {
    if (!result || rephrasingId) return;
    setRephrasingId(response.id);
    try {
      const newText = await rephraseResponse(result.utterance, response, response.text);
      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          responses: prev.responses.map((r) =>
            r.id === response.id ? { ...r, text: newText } : r
          )
        };
      });
    } catch (err) {
      console.error('[Defend] 换说法失败:', err);
      Taro.showToast({ title: '换个说法失败了', icon: 'none' });
    } finally {
      setRephrasingId(null);
    }
  };

  const engineLabel = activeLLM ? `引擎：${activeLLM.name}` : '引擎：内置规则';

  return (
    <View className={styles.page}>
      {/* 头部 */}
      <View className={styles.hero}>
        <Image className={styles.duck} src={logoDuck} mode='aspectFit' />
        <View className={styles.heroTexts}>
          <Text className={styles.heroTitle}>嘴替鸭</Text>
          <Text className={styles.heroDesc}>社交助手，帮你解决社交尴尬时刻</Text>
        </View>
        <View className={styles.engineBadge}>
          <Text className={styles.engineTag}>{engineLabel}</Text>
          <Text className={styles.engineLink}>设置页可配置大模型</Text>
        </View>
      </View>

      {/* 输入面板 */}
      <InputPanel value={inputText} onChange={setInputText} onSubmit={handleSubmit} analyzing={analyzing} />

      {/* 分析结果 */}
      <View className={styles.resultArea}>
        {analyzing && (
          <View className={styles.thinking}>
            <Image className={styles.thinkingDuck} src={logoDuck} mode='aspectFit' />
            <Text className={styles.thinkingText}>鸭鸭正在拆解对方意图…</Text>
          </View>
        )}

        {!analyzing && !result && (
          <EmptyState
            title="还没有分析结果"
            desc={'粘贴、输入或按下麦克风，把接不上话的原话丢给鸭鸭'}
          />
        )}

        {!analyzing && result && (
          <>
            <View className={styles.resultHeader}>
              <Text className={styles.resultTitle}>为你想了 {result.responses.length} 套回话</Text>
            </View>
            <View className={styles.intentCard}>
              <IntentCard result={result} />
            </View>
            {result.responses.map((r) => (
              <View key={r.id} className={styles.responseItem}>
                <ResponseCard
                  response={r}
                  rephrasing={rephrasingId === r.id}
                  onCopy={handleCopy}
                  onRephrase={handleRephrase}
                />
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}
