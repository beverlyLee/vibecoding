// 语音识别服务：真实录音 + 实时转写进文本框
// 策略（H5）：
// 1. getUserMedia + MediaRecorder 真正采集麦克风音频
// 2. 浏览器支持时并行运行 Web Speech API 实时出文字
// 3. 浏览器识别不可用时，把录到的音频发到已配置大模型的 Whisper 兼容接口转写
// 微信小程序端：尝试同声传译插件（WechatSI）

import Taro from '@tarojs/taro';
import type { LLMConfig } from '@/types/settings';
import { logger } from '@/utils/logger';

export interface SpeechCallbacks {
  // partial 为当前完整转写文本（已定稿 + 进行中）
  onPartial: (partial: string) => void;
  onFinal: (finalText: string) => void;
  onError: (message: string) => void;
}

export type SpeechMode = 'h5' | 'weapp';

// 录音最长时长（毫秒）
const MAX_DURATION = 60000;

interface H5Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: H5SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: (opts?: Record<string, unknown>) => void;
  stop: () => void;
}

interface H5SpeechEvent {
  results: { isFinal: boolean; 0: { transcript: string } }[];
  resultIndex: number;
}

interface WechatSIManager {
  onRecognize: (cb: (res: { result: string }) => void) => void;
  onStop: (cb: (res: { result: string }) => void) => void;
  onError: (cb: (res: { msg: string }) => void) => void;
  start: (opts: Record<string, unknown>) => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => H5Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => H5Recognition;
    webkitSpeechRecognition?: new () => H5Recognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// 根据厂商配置推断 ASR 模型名
function resolveAsrModel(cfg: LLMConfig): string {
  if (cfg.asrModel) return cfg.asrModel;
  const url = cfg.baseURL.toLowerCase();
  if (url.includes('siliconflow')) return 'FunAudioLLM/SenseVoiceSmall';
  if (url.includes('groq')) return 'whisper-large-v3-turbo';
  return 'whisper-1';
}

// Whisper 兼容接口转写（OpenAI / Groq / 硅基流动等）
async function transcribeWithWhisper(cfg: LLMConfig, blob: Blob): Promise<string> {
  const url = `${cfg.baseURL.replace(/\/+$/, '')}/audio/transcriptions`;
  const model = resolveAsrModel(cfg);
  logger.debug('[Speech] Whisper 转写请求:', url, '模型:', model, `音频大小 ${(blob.size / 1024).toFixed(1)}KB`);
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  formData.append('model', model);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: formData
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text);
      msg = data.error?.message || data.message || msg;
    } catch {
      // 非 JSON 响应，保留状态码
    }
    throw new Error(`${msg}（模型 ${model}）`);
  }
  const data = await res.json();
  const text = (data.text || '').trim();
  if (!text) throw new Error('云端识别结果为空');
  return text;
}

// 统一的语音识别器
export class SpeechRecognizer {
  private callbacks: SpeechCallbacks | null = null;
  private mode: SpeechMode = 'h5';
  // H5 录音
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recog: H5Recognition | null = null;
  private speechFailed = false;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  // Whisper 配置（启动时注入，可为空）
  private whisperCfg: LLMConfig | null = null;
  // 小程序
  private weappManager: WechatSIManager | null = null;
  // 小程序降级：插件不可用时用 RecorderManager 录音 + 云端转写
  private weappUseRecorder = false;
  private weappRecorder: ReturnType<typeof Taro.getRecorderManager> | null = null;

  private finalText = '';
  private running = false;

  constructor(whisperCfg?: LLMConfig | null) {
    this.whisperCfg = whisperCfg || null;
    this.mode = process.env.TARO_ENV === 'weapp' ? 'weapp' : 'h5';
    logger.debug('[Speech] 语音模式:', this.mode, this.whisperCfg ? '(含云端转写兜底)' : '');
  }

  getMode(): SpeechMode {
    return this.mode;
  }

  isRunning(): boolean {
    return this.running;
  }

  // 开始录音+识别；麦克风不可用时抛错
  async start(callbacks: SpeechCallbacks): Promise<void> {
    if (this.running) return;
    this.callbacks = callbacks;
    this.finalText = '';
    this.speechFailed = false;
    if (this.mode === 'weapp') {
      this.startWeapp();
      this.running = true;
      return;
    }
    await this.startH5();
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.mode === 'weapp') {
      try {
        if (this.weappUseRecorder) {
          this.weappRecorder?.stop();
        } else {
          this.weappManager?.stop();
        }
      } catch (err) {
        logger.error('[Speech] 小程序停止失败:', err);
      }
      return;
    }
    // 停止浏览器识别
    if (this.recog) {
      try {
        this.recog.onend = null;
        this.recog.stop();
      } catch (err) {
        logger.error('[Speech] H5 识别停止失败:', err);
      }
    }
    // 停止录音，录音结束后决定最终文本
    this.stopRecorderAndFinish();
  }

  // ============ H5 ============

  private async startH5(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风采集');
    }
    // 1. 先真正拿到麦克风
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name || '';
      logger.error('[Speech] 获取麦克风失败:', name, err);
      if (name === 'NotAllowedError') throw new Error('麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试');
      if (name === 'NotFoundError') throw new Error('未检测到麦克风设备');
      throw new Error('麦克风不可用，请检查设备');
    }
    logger.debug('[Speech] 麦克风采集已开始');

    // 2. MediaRecorder 录制真实音频（兜底云端转写用）
    this.chunks = [];
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start(500);
    } catch (err) {
      logger.error('[Speech] MediaRecorder 启动失败（不影响浏览器识别）:', err);
      this.recorder = null;
    }

    // 3. 并行启动 Web Speech API 实时转写
    const Ctor = getSpeechRecognitionCtor();
    if (Ctor) {
      this.startBrowserRecognition(Ctor);
    } else {
      logger.warn('[Speech] 浏览器不支持 Web Speech API，将在停止录音后走云端转写');
      this.speechFailed = true;
    }

    // 最长录音保护
    this.maxTimer = setTimeout(() => {
      logger.debug('[Speech] 达到最长录音时长，自动停止');
      this.stop();
    }, MAX_DURATION);
  }

  private startBrowserRecognition(Ctor: new () => H5Recognition): void {
    try {
      const recog = new Ctor();
      recog.lang = 'zh-CN';
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = (e) => {
        let partial = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            this.finalText += r[0].transcript;
          } else {
            partial += r[0].transcript;
          }
        }
        this.callbacks?.onPartial(this.finalText + partial);
      };
      recog.onerror = (e) => {
        logger.error('[Speech] 浏览器识别错误:', e.error);
        // network/service-not-allowed：Chrome 识别服务在国内网络常见失败
        // 不打断录音，停止后走云端 Whisper 兜底
        if (e.error === 'not-allowed' || e.error === 'audio-capture') {
          this.callbacks?.onError('浏览器被禁止访问麦克风，请检查系统/浏览器权限');
          this.stop();
        } else {
          this.speechFailed = true;
        }
      };
      recog.onend = () => {
        // 浏览器可能自动断流，仍在录音则续录
        if (this.running && !this.speechFailed) {
          try {
            recog.start();
          } catch (err) {
            logger.error('[Speech] 续录失败:', err);
            this.speechFailed = true;
          }
        }
      };
      this.recog = recog;
      recog.start();
      logger.debug('[Speech] 浏览器实时识别已启动');
    } catch (err) {
      logger.error('[Speech] 浏览器识别启动异常:', err);
      this.recog = null;
      this.speechFailed = true;
    }
  }

  private stopRecorderAndFinish(): void {
    const finish = (blob: Blob | null) => {
      this.releaseMic();
      if (this.finalText.trim()) {
        logger.debug('[Speech] 浏览器识别完成:', this.finalText.slice(0, 50));
        this.callbacks?.onFinal(this.finalText.trim());
        return;
      }
      // 浏览器识别没出文字：尝试云端 Whisper 兜底
      if (blob && blob.size > 0 && this.whisperCfg) {
        logger.debug('[Speech] 走云端 Whisper 转写…');
        transcribeWithWhisper(this.whisperCfg, blob)
          .then((text) => this.callbacks?.onFinal(text))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Speech] 云端转写失败:', msg);
            this.callbacks?.onError(
              `语音识别失败（浏览器识别不可用，云端转写失败：${msg}）。建议使用最新版 Chrome 并确保网络可访问识别服务`
            );
          });
        return;
      }
      if (blob && blob.size > 0) {
        this.callbacks?.onError('浏览器语音识别服务不可用（国内网络常见）。建议到设置页配置「硅基流动」Key（国内直连、含免费语音识别），配置后录音将自动走云端转写');
      } else {
        this.callbacks?.onError('没有录到声音，请检查麦克风后重试');
      }
    };

    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = () => {
        const type = this.recorder?.mimeType || 'audio/webm';
        finish(new Blob(this.chunks, { type }));
      };
      try {
        this.recorder.stop();
      } catch (err) {
        logger.error('[Speech] 录音停止失败:', err);
        finish(null);
      }
    } else {
      finish(null);
    }
  }

  private releaseMic(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.recorder = null;
    this.recog = null;
  }

  // ============ 微信小程序：同声传译插件（失败自动降级录音+云端转写） ============

  private startWeapp(): void {
    this.weappUseRecorder = false;
    this.weappManager = null;
    this.weappRecorder = null;
    try {
      const req = (globalThis as Record<string, unknown>).requirePlugin as (name: string) => { getRecordRecognitionManager: () => WechatSIManager };
      const plugin = req('WechatSI');
      const manager = plugin.getRecordRecognitionManager();
      manager.onRecognize = (res) => {
        this.callbacks?.onPartial(this.finalText + (res.result || ''));
      };
      manager.onStop = (res) => {
        this.finalText += res.result || '';
        this.running = false;
        this.callbacks?.onFinal(this.finalText);
      };
      manager.onError = (res) => {
        logger.error('[Speech] 插件识别错误:', res.msg);
        // 插件不可用（如测试号无插件权限），降级为录音 + 云端转写
        if (!this.finalText && this.whisperCfg) {
          logger.debug('[Speech] 插件不可用，降级为 RecorderManager 录音 + 云端转写');
          this.weappManager = null;
          this.startWeappRecorderFallback();
          return;
        }
        this.running = false;
        this.callbacks?.onError(res.msg || '语音识别失败');
      };
      manager.start({ duration: MAX_DURATION, lang: 'zh_CN' });
      this.weappManager = manager;
      logger.debug('[Speech] 小程序语音识别已启动（同声传译插件）');
    } catch (err) {
      logger.error('[Speech] 插件加载异常:', err);
      // requirePlugin 直接抛错（插件未注册/无权限），走降级
      this.startWeappRecorderFallback();
    }
  }

  // 小程序降级：RecorderManager 录音，停止后上传 Whisper 兼容接口转写
  private startWeappRecorderFallback(): void {
    if (!this.whisperCfg) {
      this.running = false;
      this.callbacks?.onError('语音插件不可用（测试号不支持插件），且未配置语音识别模型。请到设置页启用硅基流动等识别模型，或换用真实 AppID 并添加微信同声传译插件');
      return;
    }
    const recorder = Taro.getRecorderManager();
    this.weappUseRecorder = true;
    this.weappRecorder = recorder;
    recorder.onStop((res) => {
      logger.debug('[Speech] 小程序录音结束:', res.tempFilePath, `${((res.duration || 0) / 1000).toFixed(1)}s`);
      this.uploadWeappAudio(res.tempFilePath);
    });
    recorder.onError((res) => {
      logger.error('[Speech] 小程序录音错误:', res.errMsg);
      this.running = false;
      this.weappUseRecorder = false;
      const msg = res.errMsg || '';
      if (msg.includes('auth') || msg.includes('authorize') || msg.includes('permission')) {
        this.callbacks?.onError('录音权限被拒绝，请在小程序设置中允许麦克风');
      } else {
        this.callbacks?.onError(`录音失败：${msg || '未知原因'}`);
      }
    });
    recorder.start({
      duration: MAX_DURATION,
      format: 'mp3',
      sampleRate: 16000,
      numberOfChannels: 1
    });
    logger.debug('[Speech] 小程序录音已启动（降级模式，停止后云端转写）');
  }

  // 把录音文件上传到 Whisper 兼容接口
  private uploadWeappAudio(filePath: string): void {
    const cfg = this.whisperCfg;
    if (!cfg) return;
    const url = `${cfg.baseURL.replace(/\/+$/, '')}/audio/transcriptions`;
    const model = resolveAsrModel(cfg);
    logger.debug('[Speech] 上传小程序录音到云端转写:', url, '模型:', model);
    Taro.uploadFile({
      url,
      filePath,
      name: 'file',
      formData: { model },
      header: { Authorization: `Bearer ${cfg.apiKey}` },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          const text = (data.text || '').trim();
          if (text) {
            logger.debug('[Speech] 云端转写成功, 长度', (text || '').length);
            this.callbacks?.onFinal(text);
          } else {
            const msg = data.error?.message || data.message || '云端识别结果为空';
            this.callbacks?.onError(`云端转写失败：${msg}`);
          }
        } catch (err) {
          logger.error('[Speech] 云端响应解析失败, 长度', (res.data || '').length);
          this.callbacks?.onError('云端转写响应解析失败，请检查识别模型配置');
        }
      },
      fail: (err) => {
        logger.error('[Speech] 上传录音失败:', err.errMsg);
        this.callbacks?.onError(`云端转写请求失败：${err.errMsg || '网络错误'}（请确认已在详情中勾选不校验合法域名，或将厂商域名加入 uploadFile 合法域名）`);
      }
    });
  }
}
