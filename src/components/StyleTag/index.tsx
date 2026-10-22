import React from 'react';
import { Text } from '@tarojs/components';
import classnames from 'classnames';
import type { ResponseStyle } from '@/types/analysis';
import { getStyleMeta } from '@/types/analysis';
import styles from './index.module.scss';

interface StyleTagProps {
  style: ResponseStyle;
  size?: 'sm' | 'md';
  className?: string;
}

// 回话风格标签（温和/幽默/直接/反将）
export default function StyleTag({ style, size = 'md', className }: StyleTagProps) {
  const meta = getStyleMeta(style);
  return (
    <Text
      className={classnames(styles.tag, size === 'sm' && styles.tagSm, className)}
      style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.color }}
    >
      {meta.name}
    </Text>
  );
}
