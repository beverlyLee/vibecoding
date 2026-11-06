import React, { useState, useEffect } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import InputPanel from '@/components/InputPanel';
import IntentCard from '@/components/IntentCard';
import ResponseCard from '@/components/ResponseCard';
import EmptyState from '@/components/EmptyState';
import { analyzeUtterance, rephraseResponse, copyText, extractKeywordsFromUtterance } from '@/services/engine';
import { getAllUserQuotes, invalidateUserQuotes, initUserQuotes } from '@/services/sceneConfig';
import { useAppStore } from '@/store/useAppStore';
import { useUserStore } from '@/store/useUserStore';
import { useLoginSheet } from '@/hooks/useLoginSheet';
import AddQuoteSheet from '@/pages/quotes/AddQuoteSheet';
import type { AnalysisResult, Response } from '@/types/analysis';
import logoDuck from '@/assets/logo.png';
import styles from './index.module.scss';
import { logger, track } from '@/utils/logger';
import { EVENTS } from '@/utils/monitor';

// 按 result.source 给出页面提示
function showSourceToast(source: string) {
  switch (source) {
    case 'rule':
    case 'llm':
    case 'fallback':
    case 'fallback_no_llm':
      // 正常命中 / LLM 降级 / 规则库未匹配但无 LLM —— 全部静默，结果照展示
      break;
  }
}

// 拆招页（首页）：欢迎 + 输入原话 → 自动分析 → 多套回话
export default function DefendPage() {
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeSource, setAnalyzeSource] = useState<'llm' | 'rule' | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rephrasingId, setRephrasingId] = useState<string | null>(null);
  const [quoteSheetVisible, setQuoteSheetVisible] = useState(false);
  const [quoteSheetPrefill, setQuoteSheetPrefill] = useState<{ content: string; category: string; note: string; keywords: string[] } | null>(null);
  const activeLLM = useAppStore((s) => s.getActiveLLM());
  const clearPendingQuote = useAppStore((s) => s.clearPendingQuote);
  const { status, user, requireLogin } = useUserStore();
  const loggedIn = status === 'authenticated' && !!user;
  const loginSheet = useLoginSheet();

  // 页面曝光埋点
  useEffect(() => {
    track(EVENTS.PAGE_VIEW, { page: 'defend' });
  }, []);

  // 页面显示时检查语录回填
  useDidShow(() => {
    const quote = useAppStore.getState().pendingQuote;
    if (quote) {
      logger.debug('[Defend] 检测到语录回填, 长度', quote.length);
      // 语录回填触发的分析也需要登录，保持体验一致
      if (!requireLogin('生成回话')) {
        clearPendingQuote(); // 未登录就清掉，避免下次还触发
        return;
      }
      setInputText(quote);
      runAnalyze(quote, '语录回填');
      clearPendingQuote();
    }
  });

  const runAnalyze = async (text: string, source: string = '手动点击') => {
    if (!text.trim()) return;
    const hasLLM = !!useAppStore.getState().getActiveLLM();
    setAnalyzing(true);
    setAnalyzeSource(hasLLM ? 'llm' : 'rule');
    track(EVENTS.ANALYZE_START, {
      from: source,
      engineType: useAppStore.getState().getActiveLLM() ? 'llm' : 'rule',
    });
    try {
      const res = await analyzeUtterance(text);
      setResult(res);
      track(EVENTS.ANALYZE_DONE, {
        from: source,
        source: res.source,
        intentKey: res.intent?.[0] || '',
        costMs: res.costMs,
        ok: true,
      });
      showSourceToast(res.source);
    } catch (err) {
      logger.error('[Defend] 分析失败:', err?.message || err);
      track(EVENTS.ANALYZE_ERROR, { from: source, ok: false });
      Taro.showToast({ title: '分析出错了，再试一次', icon: 'none' });
    } finally {
      setAnalyzing(false);
      setAnalyzeSource(null);
    }
  };

  const handleSubmit = () => {
    const text = inputText.trim();
    console.log('[API] DefendPage.handleSubmit ← 「帮我接话」点击, 文字长度 =', text.length);
    if (!text) return;
    if (!requireLogin('生成回话')) return;
    runAnalyze(text, '点击帮我接话');
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    track(EVENTS.COPY_RESPONSE, { ok });
    if (ok) Taro.showToast({ title: '已复制，拿去用吧', icon: 'success', duration: 1200 });
  };

  const handleRephrase = async (response: Response) => {
    if (!result || rephrasingId) return;
    if (!requireLogin('换个说法')) return;
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
      logger.error('[Defend] 换说法失败:', err instanceof Error ? err.message : err);
      Taro.showToast({ title: '换个说法失败了', icon: 'none' });
    } finally {
      setRephrasingId(null);
    }
  };

  // 把大模型/规则生成的回话加入「我的语录」→ 弹出添加语录框预填充
  const handleAddToMine = async (text: string, fromAI: boolean) => {
    if (!loggedIn) {
      requireLogin('加入我的语录');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;

    // 确保用户语录缓存已加载，再去重，避免重复入库
    await initUserQuotes();
    const dup = getAllUserQuotes().find((q) => (q.content || '').trim() === trimmed);
    if (dup) {
      Taro.showToast({ title: '已经在你的语录里啦', icon: 'none' });
      return;
    }

    const utterance = result?.utterance || '';
    const extractedKeywords = extractKeywordsFromUtterance(utterance);
    const note = fromAI
      ? `AI 生成 · 原话：${utterance.slice(0, 80)}`
      : '拆招回话';

    setQuoteSheetPrefill({
      content: trimmed,
      category: 'AI 定制',
      note,
      keywords: extractedKeywords,
    });
    setQuoteSheetVisible(true);
  };

  return (
    <View className={styles.page}>
      {/* 欢迎区 */}
      <View className={styles.welcome}>
        <View className={styles.welcomeHead}>
          <Image className={styles.duck} src={logoDuck} mode='aspectFit' />
          <View className={styles.welcomeTexts}>
            <Text className={styles.greet}>帮你拆招</Text>
            <Text className={styles.welcomeSub}>接不上话的时刻，把原话交给我</Text>
          </View>
        </View>

        <View className={styles.welcomeCard}>
          <Text className={styles.welcomeDesc}>
            把让你语塞的话发给我，鸭鸭帮你拆解对方的意图，想好几套回话，复制就能用。
          </Text>
          <View className={styles.steps}>
            <View className={styles.step}>
              <View className={styles.stepNum}>
                <Text className={styles.stepNumText}>1</Text>
              </View>
              <Text className={styles.stepLabel}>粘贴原话</Text>
            </View>
            <Text className={styles.stepArrow}>→</Text>
            <View className={styles.step}>
              <View className={styles.stepNum}>
                <Text className={styles.stepNumText}>2</Text>
              </View>
              <Text className={styles.stepLabel}>识别意图</Text>
            </View>
            <Text className={styles.stepArrow}>→</Text>
            <View className={styles.step}>
              <View className={styles.stepNum}>
                <Text className={styles.stepNumText}>3</Text>
              </View>
              <Text className={styles.stepLabel}>复制回话</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 输入面板 */}
      <InputPanel value={inputText} onChange={setInputText} onSubmit={handleSubmit} analyzing={analyzing} />

      {/* 分析结果 */}
      <View className={styles.resultArea}>
        {analyzing && (
          <View className={styles.thinking}>
            <Image className={styles.thinkingDuck} src={logoDuck} mode='aspectFit' />
            <View className={styles.thinkingDots}>
              <View className={styles.thinkingDot} />
              <View className={styles.thinkingDot} />
              <View className={styles.thinkingDot} />
            </View>
            <Text className={styles.thinkingText}>
              {analyzeSource === 'llm' ? '正在查询大模型，小主稍等…' : '鸭鸭正在拆解对方意图…'}
            </Text>
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

            {/* 我的语录专属卡片：命中时并行展示（最多 3 条，按匹配度排序） */}
            {result.userQuotes && result.userQuotes.length > 0 && (
              <View className={styles.userQuoteSection}>
                <View className={styles.userQuoteSectionHead}>
                  <Text className={styles.userQuoteTag}>✨ 我的语录</Text>
                  <Text className={styles.userQuoteCount}>
                    命中 {result.userQuotes.length} 条相似话术
                  </Text>
                </View>
                {result.userQuotes.map((q, idx) => (
                  <View key={q.id} className={styles.userQuoteCard}>
                    <View className={styles.userQuoteHead}>
                      <Text className={styles.userQuoteRank}>#{idx + 1}</Text>
                      {q.category ? (
                        <Text className={styles.userQuoteCat}>{q.category}</Text>
                      ) : null}
                    </View>
                    <Text className={styles.userQuoteContent}>{q.content}</Text>
                    <View
                      className={styles.userQuoteCopy}
                      onClick={() => handleCopy(q.content)}
                    >
                      <Text className={styles.userQuoteCopyText}>复制这条</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {result.responses.map((r) => (
              <View key={r.id} className={styles.responseItem}>
                <ResponseCard
                  response={r}
                  rephrasing={rephrasingId === r.id}
                  onCopy={handleCopy}
                  onRephrase={handleRephrase}
                  fromAI={result.source === 'llm'}
                  onAddToMine={handleAddToMine}
                />
              </View>
            ))}
          </>
        )}
      </View>

      {/* 友好页脚 */}
      <Text className={styles.footerTip}>
        鸭鸭只是帮你组织语言，开口前记得结合当下语境哦
      </Text>

      {loginSheet}

      <AddQuoteSheet
        visible={quoteSheetVisible}
        onClose={() => setQuoteSheetVisible(false)}
        onSaved={() => setQuoteSheetVisible(false)}
        prefill={quoteSheetPrefill}
      />
    </View>
  );
}
