import React, { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import classnames from 'classnames';
import type { Response } from '@/types/analysis';
import { getStyleMeta, deriveMotto, STYLE_EMOJI } from '@/types/analysis';
import styles from './index.module.scss';

interface ResponseCardProps {
  response: Response;
  rephrasing: boolean;
  onCopy: (text: string) => void;
  onRephrase: (response: Response) => void;
  /** 该回话是否来自大模型生成（用于"加入我的语录"时标记来源） */
  fromAI?: boolean;
  /** 加入我的语录 */
  onAddToMine?: (text: string, fromAI: boolean) => void;
  /** 第几套回话（从 0 起），用于「第 N 招」角标 */
  index?: number;
}

// 回话锦囊卡：风格身份条 + 一句口诀 + 放大的回话正文(视觉主角) + 可折叠解析 + 操作
export default function ResponseCard({ response, rephrasing, onCopy, onRephrase, fromAI, onAddToMine, index }: ResponseCardProps) {
  const meta = getStyleMeta(response.style);
  const motto = deriveMotto(response);
  const [copied, setCopied] = useState(false);
  const [showReason, setShowReason] = useState(false);

  const handleCopy = () => {
    onCopy(response.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View className={styles.card} style={{ borderColor: `${meta.color}33` }}>
      {/* 风格身份条 */}
      <View className={styles.head} style={{ backgroundColor: meta.bg }}>
        <View className={styles.avatar} style={{ borderColor: `${meta.color}33` }}>
          <Text className={styles.avatarEmoji}>{STYLE_EMOJI[response.style]}</Text>
        </View>
        <View className={styles.headTexts}>
          <Text className={styles.styleName} style={{ color: meta.color }}>{meta.name}</Text>
          <Text className={styles.styleDesc}>{meta.desc}</Text>
        </View>
        {typeof index === 'number' && (
          <View className={styles.rank} style={{ backgroundColor: meta.color }}>
            <Text className={styles.rankText}>第 {index + 1} 招</Text>
          </View>
        )}
      </View>

      <View className={styles.body}>
        {/* 一句口诀：任何来源都会显示 */}
        <View className={styles.mottoWrap} style={{ backgroundColor: `${meta.color}12`, borderLeftColor: meta.color }}>
          <Text className={styles.mottoIcon}>💡</Text>
          <Text className={styles.mottoText} style={{ color: meta.color }}>{motto}</Text>
        </View>

        {/* 回话正文：始终展开、字号放大，作为视觉主角 */}
        <View className={styles.quote} style={{ borderLeftColor: meta.color }}>
          <Text className={styles.quoteMark} style={{ color: meta.color }}>“</Text>
          <Text className={styles.text}>{response.text}</Text>
        </View>

        {/* 为什么这么说：默认折叠 */}
        {response.reason && (
          <View className={styles.reasonWrap}>
            <View className={styles.reasonHead} onClick={() => setShowReason((v) => !v)}>
              <Text className={styles.reasonLabel}>🤔 为什么这么说</Text>
              <Text className={styles.reasonToggle}>{showReason ? '收起 ▴' : '看看门道 ▾'}</Text>
            </View>
            {showReason && <Text className={styles.reasonText}>{response.reason}</Text>}
          </View>
        )}
      </View>

      <View className={styles.actions}>
        <Button
          className={classnames(styles.actionBtn, styles.primaryBtn)}
          style={{ backgroundColor: meta.color }}
          onClick={handleCopy}
        >
          {copied ? '已复制 ✓' : '复制这句'}
        </Button>
        <Button
          className={styles.actionBtn}
          disabled={rephrasing}
          onClick={() => onRephrase(response)}
        >
          {rephrasing ? '换说法中…' : '🔄 换说法'}
        </Button>
        {onAddToMine && (
          <Button
            className={styles.actionBtn}
            onClick={() => onAddToMine(response.text, fromAI || false)}
          >
            ＋ 收进语录
          </Button>
        )}
      </View>
    </View>
  );
}
