import React, { useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import classnames from 'classnames';
import type { Response } from '@/types/analysis';
import { getStyleMeta } from '@/types/analysis';
import StyleTag from '@/components/StyleTag';
import styles from './index.module.scss';

interface ResponseCardProps {
  response: Response;
  rephrasing: boolean;
  onCopy: (text: string) => void;
  onRephrase: (response: Response) => void;
}

// 单条回话卡片：风格标签 + 话术 + 解析 + 复制/换说法
export default function ResponseCard({ response, rephrasing, onCopy, onRephrase }: ResponseCardProps) {
  const meta = getStyleMeta(response.style);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(response.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View className={styles.card}>
      <View className={styles.styleBar} style={{ backgroundColor: meta.bg }}>
        <StyleTag style={response.style} />
        <Text className={styles.styleDesc}>{meta.desc}</Text>
      </View>

      <Text className={styles.quoteMark} style={{ color: meta.color }}>
        “
      </Text>
      <Text className={styles.text} style={{ borderLeftColor: meta.color }}>
        {response.text}
      </Text>

      {response.reason && (
        <View className={styles.reasonWrap}>
          <Text className={styles.reasonLabel}>为什么有效</Text>
          <Text className={styles.reasonText}>{response.reason}</Text>
        </View>
      )}

      <View className={styles.actions}>
        <Button
          className={classnames(styles.actionBtn, styles.primaryBtn)}
          onClick={handleCopy}
        >
          {copied ? '已复制 ✓' : '复制'}
        </Button>
        <Button
          className={styles.actionBtn}
          disabled={rephrasing}
          onClick={() => onRephrase(response)}
        >
          {rephrasing ? '换说法中…' : '🔄 换个说法'}
        </Button>
      </View>
    </View>
  );
}
