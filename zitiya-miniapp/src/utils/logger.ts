// ================================================================
// 统一日志器（前端：weapp + H5 共用）
// ----------------------------------------------------------------
// 通道设计（"日志在哪看"）：
//   1) console        —— 开发期全程可见；生产期仅 warn/error（避免刷屏）
//   2) 微信实时日志    —— 仅 weapp 真机，仅 warn/error，在 mp 后台「运维中心→实时日志」查看
//   3) track() 埋点    —— dev 打印 console；生产 weapp 上报 report_event 云函数 → 云数据库 app_logs
//                        H5 无云环境则存 localStorage 环形缓冲（调试导出用）
//
// 隐私底线（硬性）：绝不记录用户输入原文、生成的回话原文、API Key、token。
//   - 调用方应主动只传"长度 / 标准意图名 / 成功与否 / 耗时"等元信息；
//   - logger 额外对含敏感字段名的对象做脱敏兜底；
//   - track() 仅允许白名单 props（见 ALLOWED_PROPS）。
// ================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = process.env.NODE_ENV === 'production';
const isWeapp = typeof (globalThis as any).wx !== 'undefined';

// 微信实时日志（weapp 真机专用，有单用户/单日条数与单条体积限制，故只上报 warn/error）
let realtimeLog: any = null;
try {
  const wxObj = (globalThis as any).wx;
  if (wxObj && wxObj.getRealtimeLogManager) {
    realtimeLog = wxObj.getRealtimeLogManager();
  }
} catch {
  realtimeLog = null;
}

// 脱敏：拦截明显敏感字段（对象序列化后含这些 key 就整条丢弃内容）
function sanitize(args: any[]): any[] {
  return args.map((a) => {
    if (a && typeof a === 'object') {
      try {
        const s = JSON.stringify(a);
        if (/api_?key|api_?secret|token|password|secret|access_?key|cookie|authorization/i.test(s)) {
          return '[含敏感字段,已脱敏]';
        }
        return a;
      } catch {
        return a;
      }
    }
    return a;
  });
}

function fmt(args: any[]): string {
  return sanitize(args)
    .map((x) => (typeof x === 'string' ? x : typeof x === 'object' ? JSON.stringify(x) : String(x)))
    .join(' ');
}

export class Logger {
  constructor(
    private readonly module: string,
    private readonly minLevel: LogLevel = isProd ? 'warn' : 'debug'
  ) {}

  private write(level: LogLevel, ...args: any[]) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const tag = `[${this.module}]`;
    const ts = new Date().toISOString();
    const msg = fmt(args);

    // 通道 1：console
    if (isProd) {
      if (level === 'warn') console.warn(ts, tag, msg);
      else if (level === 'error') console.error(ts, tag, msg);
      // 生产期 debug/info 不进 console，减少噪音
    } else {
      const fn =
        level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log;
      fn(ts, tag, msg);
    }

    // 通道 2：微信实时日志（仅 weapp 真机，仅 warn/error）
    if (realtimeLog && isWeapp && (level === 'warn' || level === 'error')) {
      try {
        if (level === 'error') realtimeLog.error(tag, msg);
        else realtimeLog.warn(tag, msg);
      } catch {
        /* 实时日志失败不影响主流程 */
      }
    }
  }

  debug(...args: any[]) {
    this.write('debug', ...args);
  }
  info(...args: any[]) {
    this.write('info', ...args);
  }
  warn(...args: any[]) {
    this.write('warn', ...args);
  }
  error(...args: any[]) {
    this.write('error', ...args);
  }

  /** 生成子模块 logger，例如 logger.child('engine') */
  child(sub: string): Logger {
    return new Logger(`${this.module}:${sub}`, this.minLevel);
  }
}

/** 应用级默认 logger */
export const logger = new Logger('app');

// ================================================================
// 行为埋点 track
// ----------------------------------------------------------------
// 白名单：埋点 props 只允许这些键，任何其它字段（尤其用户输入/回话/key）都会被丢弃。
const ALLOWED_PROPS = new Set([
  'page', // 页面名
  'source', // 命中来源：rule / llm / fallback / daily
  'intentKey', // 标准意图 key（非用户原话）
  'intentLayer', // 命中层 L1/L2/L3
  'ok', // 是否成功
  'costMs', // 耗时
  'errCode', // 错误码
  'engineType', // 引擎类型：rule / llm
  'count', // 数量
  'from', // 来源入口
]);

function pickAllowed(props: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(props || {})) {
    if (ALLOWED_PROPS.has(k)) out[k] = props[k];
  }
  return out;
}

const H5_BUF_KEY = 'zuitiya_events';
const H5_BUF_MAX = 50;

/** 行为埋点：dev 打印，生产 weapp 上报云函数，H5 存 localStorage 环形缓冲 */
export function track(event: string, props: Record<string, any> = {}): void {
  const clean = pickAllowed(props);
  const record = { ts: Date.now(), event, props: clean };

  if (!isProd) {
    console.log('[track]', event, clean);
    return;
  }

  if (isWeapp) {
    try {
      const wxObj = (globalThis as any).wx;
      wxObj?.cloud?.callFunction?.({ name: 'report_event', data: record }).catch?.(() => {});
    } catch {
      /* 上报失败静默 */
    }
  } else {
    try {
      const raw = (globalThis as any).localStorage?.getItem(H5_BUF_KEY);
      const buf = raw ? JSON.parse(raw) : [];
      buf.push(record);
      while (buf.length > H5_BUF_MAX) buf.shift();
      (globalThis as any).localStorage?.setItem(H5_BUF_KEY, JSON.stringify(buf));
    } catch {
      /* 存储失败静默 */
    }
  }
}
