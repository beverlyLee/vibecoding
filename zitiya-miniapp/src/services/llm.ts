// 大模型调用封装：统一 OpenAI 兼容协议 + Anthropic 协议适配
// 支持各厂商配置、连接测试、JSON 解析容错

import Taro from '@tarojs/taro';
import type { LLMConfig } from '@/types/settings';
import { getModelParams } from '@/services/sceneConfig';
import { logger } from '@/utils/logger';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  // 调用用途标记，用于日志区分（如：拆招分析 / 换说法 / 连接测试）
  tag?: string;
}

// 从模型输出中提取 JSON（容错：剥掉 markdown 代码块，支持顶层对象或数组）
export function extractJSON<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // 剥离 ```json ... ``` 代码块
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  // 同时找第一个 { 或 [，以及匹配的结尾
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  if (firstBrace === -1 && firstBracket === -1) {
    logger.error('[LLM] JSON 解析失败: 未找到 { 或 [');
    return null;
  }

  // 哪个先出现就截哪种
  let start: number, end: number;
  if (firstBrace === -1) {
    start = firstBracket;
    end = text.lastIndexOf(']');
  } else if (firstBracket === -1) {
    start = firstBrace;
    end = text.lastIndexOf('}');
  } else {
    start = Math.min(firstBrace, firstBracket);
    end = firstBrace < firstBracket ? text.lastIndexOf('}') : text.lastIndexOf(']');
  }
  if (end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (err) {
    logger.error('[LLM] JSON 解析失败', { err: err instanceof Error ? err.message : String(err), len: text.length });
    return null;
  }
}

// ============ 大模型调用日志 ============

export interface LLMLogEntry {
  time: string;
  tag: string; // 用途
  provider: string; // 厂商名
  model: string;
  protocol: string;
  ok: boolean;
  latencyMs: number;
  promptChars: number; // 输入字数
  replyChars: number; // 输出字数
  tokens?: { prompt?: number; completion?: number };
  message?: string; // 错误信息或回复预览
}

const llmLogs: LLMLogEntry[] = [];
const MAX_LLM_LOGS = 100;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 记录一次调用：控制台输出 + 内存保留最近 100 条
function recordLLMCall(entry: LLMLogEntry): void {
  llmLogs.unshift(entry);
  if (llmLogs.length > MAX_LLM_LOGS) llmLogs.pop();
  const head = `${entry.time} [${entry.tag}] ${entry.provider}/${entry.model}(${entry.protocol}) ${entry.latencyMs}ms 入${entry.promptChars}字/出${entry.replyChars}字`;
  const tokens = entry.tokens?.prompt != null ? ` tokens ${entry.tokens.prompt ?? '-'}+${entry.tokens.completion ?? '-'}` : '';
  if (entry.ok) {
    logger.debug(`[LLM] ✔ ${head}${tokens} | ${entry.message || ''}`);
  } else {
    logger.error(`[LLM] ✘ ${head} | ${entry.message || '未知错误'}`);
  }
}

// 获取最近的大模型调用日志（新在前），可用于设置页展示或排查
export function getLLMLogs(): LLMLogEntry[] {
  return llmLogs.slice();
}

// 统一对话接口：根据配置协议分发 + 统一日志
export async function chatCompletion(cfg: LLMConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  // 未显式传参时，回退到后台可配置的模型参数（default 档）
  const fallback = getModelParams('default');
  const temperature = opts.temperature ?? fallback.temperature;
  const maxTokens = opts.maxTokens ?? fallback.maxTokens;
  const timeout = opts.timeout ?? fallback.timeout;
  const tag = opts.tag || '对话';
  const start = Date.now();
  const promptChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  logger.debug(`[LLM] → 请求 ${cfg.name}/${cfg.model} [${tag}] ${messages.length}条消息 ${promptChars}字`);

  try {
    const reply = cfg.protocol === 'anthropic'
      ? await callAnthropic(cfg, messages, { temperature, maxTokens, timeout })
      : await callOpenAI(cfg, messages, { temperature, maxTokens, timeout });
    recordLLMCall({
      time: nowTime(),
      tag,
      provider: cfg.name,
      model: cfg.model,
      protocol: cfg.protocol || 'openai',
      ok: true,
      latencyMs: Date.now() - start,
      promptChars,
      replyChars: reply.text.length,
      tokens: reply.usage,
      message: `回复：${reply.text.slice(0, 60).replace(/\s+/g, ' ')}`
    });
    return reply.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordLLMCall({
      time: nowTime(),
      tag,
      provider: cfg.name,
      model: cfg.model,
      protocol: cfg.protocol || 'openai',
      ok: false,
      latencyMs: Date.now() - start,
      promptChars,
      replyChars: 0,
      message: msg
    });
    throw err;
  }
}

interface LLMReply {
  text: string;
  usage?: { prompt?: number; completion?: number };
}

// OpenAI 兼容协议（DeepSeek / 智谱 / 通义 / Kimi / OpenAI / 自定义）
async function callOpenAI(cfg: LLMConfig, messages: ChatMessage[], opts: { temperature: number; maxTokens: number; timeout: number }): Promise<LLMReply> {
  const url = `${cfg.baseURL.replace(/\/+$/, '')}/chat/completions`;
  logger.debug('[HTTP] llm.callOpenAI → POST', url, '模型:', cfg.model);
  const httpStart = Date.now();
  const res = await Taro.request({
    url,
    method: 'POST',
    timeout: opts.timeout,
    header: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    data: {
      model: cfg.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false
    }
  });
  if (res.statusCode >= 400) {
    const errMsg = (res.data && (res.data.error?.message || res.data.message)) || `HTTP ${res.statusCode}`;
    logger.error('[HTTP] llm.callOpenAI ✘', res.statusCode, `${Date.now() - httpStart}ms`, errMsg);
    throw new Error(errMsg);
  }
  logger.debug('[HTTP] llm.callOpenAI ✔', res.statusCode, `${Date.now() - httpStart}ms`);
  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) {
    logger.error('[LLM] 响应结构异常:', JSON.stringify(res.data).slice(0, 300));
    throw new Error('模型响应为空');
  }
  const usage = res.data?.usage;
  return {
    text: content,
    usage: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : undefined
  };
}

// Anthropic 协议
async function callAnthropic(cfg: LLMConfig, messages: ChatMessage[], opts: { temperature: number; maxTokens: number; timeout: number }): Promise<LLMReply> {
  const url = `${cfg.baseURL.replace(/\/+$/, '')}/v1/messages`;
  logger.debug('[HTTP] llm.callAnthropic → POST', url, '模型:', cfg.model);
  const httpStart = Date.now();
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = messages.filter((m) => m.role !== 'system');
  const res = await Taro.request({
    url,
    method: 'POST',
    timeout: opts.timeout,
    header: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    },
    data: {
      model: cfg.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: system || undefined,
      messages: rest
    }
  });
  if (res.statusCode >= 400) {
    const errMsg = (res.data && (res.data.error?.message || res.data.message)) || `HTTP ${res.statusCode}`;
    logger.error('[HTTP] llm.callAnthropic ✘', res.statusCode, `${Date.now() - httpStart}ms`, errMsg);
    throw new Error(errMsg);
  }
  logger.debug('[HTTP] llm.callAnthropic ✔', res.statusCode, `${Date.now() - httpStart}ms`);
  const blocks = res.data?.content;
  const text = Array.isArray(blocks) ? blocks.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') : '';
  if (!text) {
    logger.error('[LLM] 响应结构异常:', JSON.stringify(res.data).slice(0, 300));
    throw new Error('模型响应为空');
  }
  const usage = res.data?.usage;
  return {
    text,
    usage: usage ? { prompt: usage.input_tokens, completion: usage.output_tokens } : undefined
  };
}

// 连接测试：返回延迟与结果描述
export interface TestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export async function testConnection(cfg: LLMConfig): Promise<TestResult> {
  const start = Date.now();
  try {
    const reply = await chatCompletion(
      cfg,
      [{ role: 'user', content: '你好，这是连接测试，请只回复两个字：成功' }],
      { tag: '连接测试', temperature: 0, maxTokens: 20, timeout: 20000 }
    );
    const latencyMs = Date.now() - start;
    logger.debug('[LLM] 连接测试成功:', cfg.name, `${latencyMs}ms`);
    return { ok: true, latencyMs, message: `连接成功（${latencyMs}ms）：${reply.slice(0, 30)}` };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[LLM] 连接测试失败:', cfg.name, msg);
    return { ok: false, latencyMs, message: `连接失败：${msg}` };
  }
}

// 语音识别接口连接测试：
// 不带音频文件请求 /audio/transcriptions，预期返回 400/422（证明接口存在且鉴权通过）
// 401/403 说明 Key 无效，404 说明该厂商无音频转写接口
export async function testAsrConnection(cfg: LLMConfig): Promise<TestResult> {
  logger.debug('[API] llm.testAsrConnection ← 入口, 厂商:', cfg.name);
  const start = Date.now();
  const url = `${cfg.baseURL.replace(/\/+$/, '')}/audio/transcriptions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    logger.debug('[LLM] 语音识别接口测试:', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: new FormData(),
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (res.status === 400 || res.status === 422 || res.ok) {
      return { ok: true, latencyMs, message: `语音识别接口可用（${latencyMs}ms）` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, message: 'API Key 无效或权限不足，请检查 Key' };
    }
    if (res.status === 404) {
      return { ok: false, latencyMs, message: '该厂商接口不支持语音识别（404），请更换支持音频的厂商' };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, latencyMs, message: `接口返回 HTTP ${res.status}：${text.slice(0, 80)}` };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error && err.name === 'AbortError' ? '请求超时' : err instanceof Error ? err.message : String(err);
    logger.error('[LLM] 语音识别接口测试失败:', msg);
    return { ok: false, latencyMs, message: `连接失败：${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
