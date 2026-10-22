/* engine/logger.ts · 轻量日志模块（纯前端，无后端依赖）
 * - 按天滚动：每天一个存储分片 heal-logs-YYYY-MM-DD，写入时自动清理超过保留天数的旧分片
 * - 控制台可见：AI 调用的完整提示词以可展开分组打印，方便检查发给模型的内容
 * - 长字符串截断：base64 / dataURL 折叠为占位符，提示词保留完整（上限 MAX_STR）
 */
import type { AiRuntime } from './providers';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;          // 时间戳
  level: LogLevel;
  tag: string;        // 模块标签，如 'ai'
  msg: string;        // 已脱敏/截断的 JSON 文本
}

const PREFIX = 'heal-logs-';
const KEEP_DAYS = 7;      // 滚动保留天数（含今天）
const MAX_PER_DAY = 500;  // 单日条数上限，超出丢最旧
const MAX_STR = 6000;     // 字符串持久化上限（提示词远小于此，可完整保留）

function pad(n: number): string { return String(n).padStart(2, '0'); }
function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDay(key: string): number {
  const m = key.match(/^heal-logs-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
}

/* 存储抽象：浏览器用 localStorage，不可用（node 测试 / 隐私模式）时退化为内存 Map */
const memStore = new Map<string, string>();
function ls(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function stGet(k: string): string | null {
  const s = ls();
  return s ? s.getItem(k) : memStore.get(k) ?? null;
}
function stSet(k: string, v: string): void {
  const s = ls();
  if (s) s.setItem(k, v); else memStore.set(k, v);
}
function stDel(k: string): void {
  const s = ls();
  if (s) s.removeItem(k); else memStore.delete(k);
}
function stKeys(): string[] {
  const s = ls();
  if (!s) return [...memStore.keys()];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k) out.push(k);
  }
  return out;
}

/* dataURL / 超长字符串折叠；对象递归脱敏后返回可持久化副本 */
export function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^data:/.test(value)) return `[dataURL ${value.length} chars]`;
    return value.length > MAX_STR ? value.slice(0, MAX_STR) + `…[+${value.length - MAX_STR}]` : value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

function roll(now = Date.now()): void {
  try {
    const keep = KEEP_DAYS * 86400000;
    for (const k of stKeys()) {
      if (!k.startsWith(PREFIX)) continue;
      const day = parseDay(k);
      if (!Number.isNaN(day) && now - day >= keep) stDel(k);
    }
  } catch { /* 存储不可用：静默降级，仅控制台输出 */ }
}

function read(day: string): LogEntry[] {
  try {
    return JSON.parse(stGet(PREFIX + day) ?? '[]') as LogEntry[];
  } catch { return []; }
}

function write(day: string, entries: LogEntry[]): void {
  try { stSet(PREFIX + day, JSON.stringify(entries.slice(-MAX_PER_DAY))); } catch { /* 静默降级 */ }
}

export const logger = {
  /** 记录一条日志：写当日分片 + 滚动清理 */
  log(tag: string, msg: unknown, level: LogLevel = 'info'): void {
    roll();
    const entry: LogEntry = { t: Date.now(), level, tag, msg: JSON.stringify(sanitize(msg)) };
    const day = dayKey();
    write(day, [...read(day), entry]);
    const print = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    print(`[${tag}]`, msg);
  },

  /** AI 调用专用：完整请求在控制台可展开查看（含提示词），持久化时脱敏截断 */
  ai(tag: string, payload: Record<string, unknown>, level: LogLevel = 'info'): void {
    console.groupCollapsed(`%c[AI] ${tag}`, 'color:#8a7a68');
    console.log(payload);
    console.groupEnd();
    this.log('ai', { tag, ...payload }, level);
  },

  /** 供 AiRuntime 调用点快速构造脱敏载荷（自动隐藏 API Key） */
  runtime(rt: AiRuntime): Record<string, unknown> {
    return {
      provider: rt.profile?.name,
      baseUrl: rt.profile?.baseUrl,
      chatModel: rt.model,
      imageModel: rt.imageModel,
      apiKey: rt.apiKey ? `${rt.apiKey.slice(0, 6)}…` : '(空)',
    };
  },

  /** 读取某天日志（缺省今天）；days() 列出现存分片；clear() 清空全部 */
  entries(day = dayKey()): LogEntry[] { return read(day); },
  days(): string[] {
    return stKeys()
      .filter(k => k.startsWith(PREFIX))
      .map(k => k.slice(PREFIX.length))
      .sort();
  },
  clear(): void {
    for (const k of stKeys()) {
      if (k.startsWith(PREFIX)) stDel(k);
    }
  },

  /** 下载某天日志为 .json（缺省今天），便于离线排查 */
  download(day = dayKey()): void {
    const blob = new Blob([JSON.stringify(this.entries(day), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `healing-logs-${day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

/* 控制台调试入口：window.healLogger.entries('2026-09-03') / .days() / .download() */
declare global { interface Window { healLogger: typeof logger } }
if (typeof window !== 'undefined') window.healLogger = logger;

/* 仅测试用：向存储层直写分片（模拟历史日志验证滚动清理） */
export const _internals = { stSet, stGet };
