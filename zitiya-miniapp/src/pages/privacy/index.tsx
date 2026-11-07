import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

// 隐私协议页：嘴替鸭仅收集运行所必需的数据，对话内容不落库、不用于训练、不分享第三方
export default function PrivacyPage() {
  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <Text className={styles.heroIcon}>🔒</Text>
        <Text className={styles.heroTitle}>嘴替鸭隐私协议</Text>
        <Text className={styles.heroSub}>我们只获取必要信息，尊重你的每一份数据</Text>
      </View>

      {/* 概述 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>📋 协议概述</Text>
        <Text className={styles.sectionBody}>
          嘴替鸭是一款帮助你把社交原话改写成得体回话的小程序。我们深知隐私的重要性，本协议的底线是：
          <Text className={styles.strong}>你输入的对话内容仅用于本次生成，我们不会保存、不会用于训练，也不会分享给任何第三方。</Text>
          下文说明我们收集哪些信息、如何使用与保护它们，以及你拥有的权利。
        </Text>
      </View>

      {/* 我们会收集的 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>✅ 我们收集的信息</Text>

        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>🆔</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>微信身份标识（openid）</Text>
            <Text className={styles.highlightDesc}>
              用于识别你的账号。该标识由微信服务端下发，仅用于登录与数据归属，不关联你的手机号、微信号或真实资料。
            </Text>
          </View>
        </View>

        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>👤</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你主动填写的档案</Text>
            <Text className={styles.highlightDesc}>
              昵称、头像（均为可选，默认「微信用户」与鸭鸭头像）。你可随时修改，或在注销时删除。
            </Text>
          </View>
        </View>

        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>💬</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你输入的社交原话</Text>
            <Text className={styles.highlightDesc}>
              仅在本次会话的内存中用于生成回话，<Text className={styles.strong}>不会写入任何数据库，也不会被保存为记录</Text>。关闭页面后即消失。
            </Text>
          </View>
        </View>

        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>📚</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你主动保存的语录</Text>
            <Text className={styles.highlightDesc}>
              当你点击「保存语录」时，该条内容会存入你的云端账户以便日后调用。这是你主动创建的内容，可随时单条删除或全部清除。
            </Text>
          </View>
        </View>

        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>📊</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>匿名使用数据</Text>
            <Text className={styles.highlightDesc}>
              为改进产品，我们收集少量匿名行为数据（见「日志与匿名数据」一节），不含任何对话原文或密钥。
            </Text>
          </View>
        </View>
      </View>

      {/* 我们不收集 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🚫 我们绝不收集</Text>
        <Text className={styles.sectionBody}>以下敏感信息在小程序内均未被主动获取：</Text>
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
            <Text>相册、相机（除非你主动使用语音输入，否则不申请麦克风权限；语音仅在本次实时转写为文字，不保存音频、不上传音频）</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>✕</Text>
            <Text>剪贴板（复制回话走系统原生复制，不读取你的剪贴板）</Text>
          </View>
        </View>
      </View>

      {/* 模型与 API Key */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🔑 模型与 API Key</Text>
        <Text className={styles.sectionBody}>
          嘴替鸭的生成能力依赖大模型。根据配置方式不同，密钥与请求路径有所区别：
        </Text>
        <View style={{ height: '16rpx' }} />
        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>📱</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>你自己配置的模型</Text>
            <Text className={styles.highlightDesc}>
              在「我的 → 模型配置」中填写的 API Key、接口地址、模型名，均保存在你手机本地（微信本地存储），
              <Text className={styles.strong}>服务端不会接收、存储或转发</Text>。请求由你的手机直接发往对应厂商，不含任何身份信息。
            </Text>
          </View>
        </View>
        <View className={styles.highlightRow}>
          <Text className={styles.highlightIcon}>☁️</Text>
          <View className={styles.highlightContent}>
            <Text className={styles.highlightLabel}>管理员统一配置的全局模型</Text>
            <Text className={styles.highlightDesc}>
              若你使用的是平台管理员在后台配置的全局模型，其 API Key 由<Text className={styles.strong}>服务端托管</Text>，
              客户端永不接触密钥。请求经由我们的服务端转发至厂商，转发过程<Text className={styles.strong}>不留存对话内容</Text>。
            </Text>
          </View>
        </View>
      </View>

      {/* 日志与匿名数据 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>📈 日志与匿名数据</Text>
        <Text className={styles.sectionBody}>
          为改进产品，我们收集少量匿名使用数据，例如：访问了哪些页面、使用了哪些功能（如拆招分析、语录浏览）、设备类型等。
        </Text>
        <View style={{ height: '16rpx' }} />
        <Text className={styles.sectionBody}>
          这些数据的收集遵循一条不可逾越的底线——<Text className={styles.strong}>绝不包含你输入的任何原话、生成的回话内容，也不包含 API Key</Text>。
          上报字段受白名单严格限制（仅允许页面名、命中来源、标准意图、成功与否、耗时等元信息）。即使发生报错，日志也只记录错误类型与耗时。
        </Text>
        <View style={{ height: '16rpx' }} />
        <Text className={styles.sectionBody}>
          小程序端行为数据通过微信云开发匿名上报，仅用于统计聚合（如「今天多少人用了拆招」），无法回溯到具体个人；
          H5（网页版）的运行日志只保存在你自己的浏览器本地，不会上传服务器。
        </Text>
      </View>

      {/* 数据共享与第三方 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🤝 数据共享与第三方</Text>
        <Text className={styles.sectionBody}>
          我们<Text className={styles.strong}>不会出售或向第三方分享</Text>你的个人信息。仅在为你提供服务所必需时，数据会流向以下受托方：
        </Text>
        <View style={{ height: '16rpx' }} />
        <View className={styles.denyList}>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>·</Text>
            <Text>腾讯云（微信云开发）：用于账户登录、语录存储与匿名日志托管，受腾讯隐私政策约束。</Text>
          </View>
          <View className={styles.denyItem}>
            <Text className={styles.denyCheck}>·</Text>
            <Text>你选择的模型服务商（如 DeepSeek、火山引擎、硅基流动等）：仅在你使用对应模型时，接收你的输入文本与生成请求。</Text>
          </View>
        </View>
      </View>

      {/* 注销与删除 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>🗑️ 你的权利与数据删除</Text>
        <Text className={styles.sectionBody}>
          你拥有对个人数据的查询、更正、复制与删除权利。可随时在「我的 → 注销账号」删除账户：
          注销后云端用户档案与已保存语录会被立即永久删除，本地存储一并清空。删除不可恢复，请谨慎操作。
        </Text>
      </View>

      <View className={styles.footer}>
        嘴替鸭保留对本协议的解释与修改权利。协议更新会在小程序内以显著方式提示，你可以在「我的 → 隐私协议」随时查看最新版本。
        若你有任何隐私疑问，可通过小程序内反馈渠道联系我们。
      </View>
    </View>
  );
}
