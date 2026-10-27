import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

// 隐私协议页：嘴替鸭不主动收集敏感信息，API Key 仅存本机
export default function PrivacyPage() {
  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={styles.heroIcon}>🔒</Text>
        <Text className={styles.heroTitle}>嘴替鸭隐私承诺</Text>
        <Text className={styles.heroSub}>我们只获取必要信息，尊重你的每一份数据</Text>
      </View>

      {/* 我们会收集 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>✅ 我们会收集的</Text>
        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>🆔</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>微信身份标识</Text>
            <Text className={styles.highlightDesc}>
              仅用于识别你的用户身份（openid），不关联手机号、微信号或任何个人资料
            </Text>
          </View>
        </View>
        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>👤</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你主动填写的档案</Text>
            <Text className={styles.highlightDesc}>
              昵称、头像（可选，默认值为「微信用户」与鸭鸭头像），可随时修改或注销
            </Text>
          </View>
        </View>
        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>📝</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你输入的社交原话</Text>
            <Text className={styles.highlightDesc}>
              仅在本次会话内用于生成回话，不会保存任何对话记录或输入内容
            </Text>
          </View>
        </View>
      </View>

      {/* 我们不收集 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🚫 我们绝不会收集的</Text>
        <Text className={styles.sectionBody}>嘴替鸭不主动获取以下任何敏感信息，小程序中相关接口未被调用：</Text>
        <View style={{ height: '16rpx' }} />
        <View className={styles.denyList}>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>手机号码、微信号、真实姓名、身份证号</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>地理位置、精确或模糊坐标</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>微信通讯录、好友列表</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>相册、相机、麦克风（拆招页的"语音输入"功能暂未上线，未来上线前会单独向你申请授权）</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>剪贴板（复制回话走系统原生复制，不读取你的剪贴板）</Text>
          </View>
        </View>
      </View>

      {/* API Key 存储 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🔑 API Key 与模型配置</Text>
        <Text className={styles.sectionBody}>
          你在「设置」页配置的大模型 API Key、接口地址、模型名称等，均保存在你自己的手机上，
          通过微信小程序本地存储（Taro.setStorageSync）实现。嘴替鸭服务器**不会接收、存储或转发**你的 API Key。
        </Text>
        <View style={{ height: '16rpx' }} />
        <Text className={styles.sectionBody}>
          当你在拆招/出招时，模型请求由你的手机直接发往厂商接口（如 DeepSeek、火山引擎、硅基流动等）。
          请求中只包含你输入的原话和模型参数，**不携带 openid、昵称等任何身份信息**。
        </Text>
      </View>

      {/* 注销账号 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🗑️ 注销与数据删除</Text>
        <Text className={styles.sectionBody}>
          你可以随时在「我的 → 注销账号」中删除自己的账号。注销后，云端用户档案会被立即永久删除，
          本地存储也会一并清空。删除操作不可恢复，请谨慎操作。
        </Text>
      </View>

      <View className={styles.footer}>
        嘴替鸭保留对本协议的解释与修改权利。协议更新会在小程序内以显著方式提示。
        你可以在「我的 → 隐私协议」随时查看最新版本。
      </View>
    </View>
  );
}
