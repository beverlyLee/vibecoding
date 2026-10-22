import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Textarea, Button } from '@tarojs/components';
import classnames from 'classnames';
import Taro from '@tarojs/taro';
import { SpeechRecognizer } from '@/services/speech';
import { useAppStore } from '@/store/useAppStore';
import { SAMPLE_UTTERANCES } from '@/data/intents';
import styles from './index.module.scss';

interface InputPanelProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  analyzing: boolean;
}

// 输入面板：快捷示例 + 文本框 + 语音转写 + 分析按钮
const HIDE_VOICE = true; // TODO: 语音识别暂时下线，等可测试时恢复
export default function InputPanel({ value, onChange, onSubmit, analyzing }: InputPanelProps) {
  const [recording, setRecording] = useState(false);
  const [voiceHint, setVoiceHint] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // 组件卸载时停止录音
      if (recognizerRef.current?.isRunning()) {
        recognizerRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const endRecording = () => {
    stopTimer();
    setRecording(false);
    setVoiceHint('');
    setSeconds(0);
  };

  const toggleRecord = async () => {
    console.log('[InputPanel] 语音按钮点击, recording =', recording);
    if (recording) {
      setVoiceHint('识别中…');
      recognizerRef.current?.stop();
      return;
    }
    // 注入支持语音识别的厂商配置，作为云端 Whisper 转写兜底
    const whisperCfg = useAppStore.getState().getAsrLLM();
    const recog = new SpeechRecognizer(whisperCfg);
    recognizerRef.current = recog;
    try {
      await recog.start({
        onPartial: (text) => {
          onChange(text);
        },
        onFinal: (text) => {
          if (text.trim()) onChange(text.trim());
          endRecording();
        },
        onError: (message) => {
          console.error('[InputPanel] 语音错误:', message);
          endRecording();
          if (message.length > 30) {
            Taro.showModal({ title: '语音转写失败', content: message, showCancel: false, confirmText: '知道了', confirmColor: '#E8940A' });
          } else {
            Taro.showToast({ title: message, icon: 'none', duration: 3000 });
          }
        }
      });
      // 启动成功
      setRecording(true);
      setSeconds(0);
      setVoiceHint('正在聆听，请说话…');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[InputPanel] 录音启动失败:', msg);
      recognizerRef.current = null;
      endRecording();
      Taro.showToast({ title: msg.slice(0, 40), icon: 'none', duration: 3000 });
    }
  };

  const handleSample = (text: string) => {
    onChange(text);
  };

  // 接话按钮：不用原生 disabled（点了没任何反馈），改为点击时校验并给出提示
  const handleSubmitClick = () => {
    const text = value.trim();
    console.log('[InputPanel] 「帮我接话」点击, 文字长度 =', text.length, ', analyzing =', analyzing);
    if (!text) {
      Taro.showToast({ title: '先输入或粘贴对方说的话', icon: 'none', duration: 2000 });
      return;
    }
    if (analyzing) {
      Taro.showToast({ title: '鸭鸭正在思考，请稍候', icon: 'none', duration: 1500 });
      return;
    }
    onSubmit();
  };

  return (
    <View className={styles.panel}>
      {/* 快捷示例（常驻挂载，value 非空或录音时用 CSS 隐藏，避免动态挂载导致事件绑定失效） */}
      <View
        className={styles.samples}
        style={{ display: !value && !recording ? 'block' : 'none' }}
      >
        <Text className={styles.samplesLabel}>试试这些名场面：</Text>
        <View className={styles.sampleWrap}>
          {SAMPLE_UTTERANCES.slice(0, 4).map((s) => (
            <View
              key={s}
              className={styles.sampleChip}
              onClick={() => {
                console.log('[InputPanel] 选中示例:', s);
                handleSample(s);
              }}
            >
              <Text className={styles.sampleChipText}>{s.length > 16 ? `${s.slice(0, 16)}…` : s}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 文本输入区 */}
      <View className={classnames(styles.inputBox, recording && styles.inputBoxRecording)}>
        <Textarea
          className={styles.textarea}
          value={value}
          placeholder={recording ? '正在转写你的话…' : '粘贴或输入别人的原话，例如："怎么还不找对象啊？"'}
          placeholderClass={styles.placeholder}
          maxlength={500}
          autoHeight
          disabled={recording}
          onInput={(e) => onChange(e.detail.value)}
        />
        <View className={styles.metaRow}>
          <Text className={classnames(styles.voiceHint, recording && styles.voiceHintActive)}>
            {recording ? `● 录音中 ${seconds}s · ${voiceHint}` : voiceHint}
          </Text>
          <Text className={styles.count}>{value.length}/500</Text>
        </View>
      </View>

      {/* 操作区 */}
      <View className={styles.actions}>
        {!HIDE_VOICE && (
          <Button
            className={classnames(styles.voiceBtn, recording && styles.voiceBtnRecording)}
            onClick={toggleRecord}
          >
            {recording ? '■ 停止' : '🎤 说话'}
          </Button>
        )}
        <Button
          className={classnames(styles.submitBtn, (!value.trim() || analyzing) && styles.submitBtnDisabled)}
          onClick={handleSubmitClick}
        >
          {analyzing ? '🦆 嘴替思考中…' : '帮我接话'}
        </Button>
      </View>
    </View>
  );
}
