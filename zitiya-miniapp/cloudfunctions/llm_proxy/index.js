// 云函数 llm_proxy —— LLM 调用代理（OpenAI / Anthropic 协议）
// 作用：小程序端把请求参数透传过来，由云函数转发到各厂商 API，
//       规避小程序「request 合法域名」白名单限制（云函数可直连公网）。
//
// 安全红线：严禁 console.log(event) 或打印 apiKey！云函数日志会持久化，泄露 Key。
//          本函数仅记录 protocol / model / url，不记录任何密钥。
//
// 注意：微信云函数运行时（老版本 Node）没有全局 fetch / AbortController，
//       因此使用 Node 内置的 http/https 模块，零依赖、任意 Node 版本可用。

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const http = require('http');
const https = require('https');
const { URL } = require('url');

function logf(level, msg) {
  console.log(JSON.stringify({ ts: Date.now(), level, fn: 'llm_proxy', msg }));
}

// ================================================================
// 积分检查（代理给 user_points 云函数，职责单一）
// ================================================================
async function checkAndConsumePoints() {
  const ctx = cloud.getWXContext();
  const openid = ctx.OPENID;
  if (!openid) return { ok: true };
  try {
    // 显式传 openid：嵌套调用 user_points 时它的 cloud.getWXContext 拿不到
    const res = await cloud.callFunction({ name: 'user_points', data: { action: 'deduct', openid } });
    const r = res.result || {};
    if (r.code === 0) return { ok: true };
    return { ok: false, code: r.code || 429, message: r.message || '积分不足' };
  } catch (e) {
    logf('error', `积分检查异常，放行: ${e && e.message}`);
    return { ok: true };
  }
}

// 从 Responses API 的 output 数组中提取 assistant 文本
// 格式参考：[{type:"message", role:"assistant", content:[{type:"output_text", text:"..."}]}, ...]
function extractResponsesText(outputArr) {
  if (!Array.isArray(outputArr)) return '';
  const parts = [];
  for (const item of outputArr) {
    if (!item || typeof item !== 'object') continue;
    // 标准 Responses API：type="message" + role="assistant"
    if (item.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && c.type === 'output_text' && typeof c.text === 'string') {
          parts.push(c.text);
        }
      }
    }
    // 兜底：直接有 text 字段的 item
    if (typeof item.text === 'string' && item.text) {
      parts.push(item.text);
    }
  }
  return parts.join('');
}

// 用内置 http/https 发一次 JSON POST，返回 { status, json }
function requestJSON(targetUrl, headers, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(targetUrl);
    } catch (e) {
      return reject(new Error('baseURL 非法: ' + targetUrl));
    }
    const lib = url.protocol === 'http:' ? http : https;
    const payload = JSON.stringify(bodyObj);
    const reqHeaders = Object.assign(
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      headers
    );
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: (url.pathname || '/') + (url.search || ''),
      headers: reqHeaders
    };

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch (e) {
          json = { _raw: raw };
        }
        resolve({ status: res.statusCode, json });
      });
    });

    req.on('error', (err) => reject(err));

    // 超时兜底：销毁请求，触发 error -> reject
    const timer = setTimeout(() => {
      req.destroy(new Error('请求超时'));
    }, timeoutMs);
    req.on('close', () => clearTimeout(timer));

    req.write(payload);
    req.end();
  });
}

exports.main = async (event) => {
  // ================================================================
  // 0. LLM 积分检查（最前置拦截）
  // ================================================================
  const quota = await checkAndConsumePoints();
  if (!quota.ok) {
    return { code: quota.code, message: quota.message, data: null };
  }

  const {
    protocol = 'openai',
    baseURL = '',
    apiKey = '',
    model = '',
    messages = [],
    temperature,
    maxTokens,
    timeout = 55000,
    useGlobal = false
  } = event || {};

  let resolvedProtocol = protocol;
  let resolvedBase = baseURL;
  let resolvedKey = apiKey;
  let resolvedModel = model;

  // 全局模式：从云端 global_llm_config 读取密钥（多模型架构，取第一个 enabled 的；兼容旧单模型格式）
  if (useGlobal) {
    try {
      const docRes = await db.collection('global_llm_config').doc('default').get();
      const listDoc = docRes && docRes.data;
      let g = null;
      if (listDoc && Array.isArray(listDoc.items)) {
        // 新格式：items 数组
        g = listDoc.items.find((it) => it.enabled);
      } else if (listDoc && listDoc.enabled && listDoc.apiKey && listDoc.baseURL && listDoc.model) {
        // 旧格式兼容：根目录直接是配置字段
        g = listDoc;
      }
      if (!g || !g.apiKey || !g.baseURL || !g.model) {
        return { code: 400, message: '全局模型未配置或未启用（请到管理后台配置全局模型）', data: null };
      }
      resolvedProtocol = g.protocol || 'openai';
      resolvedBase = g.baseURL;
      resolvedKey = g.apiKey;
      resolvedModel = g.model;
      logf('info', `走全局模型配置 id=${g.id || 'legacy'} protocol=${resolvedProtocol} model=${resolvedModel}`);
    } catch (e) {
      const code = e && (e.errCode || e.code);
      // 集合不存在 / 文档不存在 → 等价于未配置
      if (code === -502005 || code === -1) {
        return { code: 400, message: '全局模型未配置或未启用（请到管理后台配置全局模型）', data: null };
      }
      return { code: 500, message: '读取全局模型配置失败: ' + (e && e.message || String(e)), data: null };
    }
  }

  if (!resolvedBase || !resolvedKey || !resolvedModel) {
    return { code: 400, message: '缺少 baseURL / apiKey / model', data: null };
  }

  const isAnthropic = resolvedProtocol === 'anthropic';
  const cleanBase = resolvedBase.replace(/\/+$/, '');
  // 智能检测：如果 baseURL 已经包含完整 endpoint 路径（用户可能直接填了完整 URL），就不再拼接
  const hasChatEndpoint = /\/(chat\/completions|completions|responses|messages)(\/|$|\?)/i.test(cleanBase);
  const suffix = isAnthropic ? '/v1/messages' : '/chat/completions';
  const targetUrl = hasChatEndpoint ? cleanBase : cleanBase + suffix;
  if (hasChatEndpoint) logf('warn', `baseURL 已包含 endpoint 路径，跳过自动拼接 suffix=${suffix}`);

  const headers = {};
  let body;
  if (isAnthropic) {
    headers['x-api-key'] = resolvedKey;
    headers['anthropic-version'] = '2023-06-01';
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      temperature,
      system: system || undefined,
      messages: messages.filter((m) => m.role !== 'system')
    };
  } else {
    headers['Authorization'] = `Bearer ${resolvedKey}`;
    // economy / lite 类模型可能不接受过大的 max_tokens，加个上限保护
    const safeMaxTokens = maxTokens ? Math.min(Math.max(maxTokens, 32), 4096) : undefined;
    body = { model: resolvedModel, messages, temperature };
    if (safeMaxTokens) body.max_tokens = safeMaxTokens;
    body.stream = false;
  }

  logf('info', `转发 ${protocol} -> ${targetUrl} model=${model}`);

  const timeoutMs = Math.min(timeout || 55000, 55000);
  try {
    const { status, json } = await requestJSON(targetUrl, headers, body, timeoutMs);
    if (status >= 400) {
      const msg =
        (json && json.error && json.error.message) ||
        (json && json.message) ||
        `HTTP ${status}`;
      logf('warn', `厂商返回错误 ${status}: ${msg}`);
      return { code: status, message: msg, data: null };
    }

    let text;
    let usage;
    if (isAnthropic) {
      const blocks = json.content || [];
      text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      usage = json.usage
        ? { prompt: json.usage.input_tokens, completion: json.usage.output_tokens }
        : undefined;
    } else {
      // 优先级1：标准 Chat Completions 格式
      text =
        (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      usage = json && json.usage
        ? { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens }
        : undefined;

      // 优先级2：Responses API 格式（output 数组，火山方舟新模型）
      if (!text && json && Array.isArray(json.output)) {
        text = extractResponsesText(json.output);
        usage = json.usage
          ? { prompt: json.usage.input_tokens || 0, completion: json.usage.output_tokens || 0 }
          : usage;
        logf('info', `检测到 Responses API 格式响应，提取 text 长度=${text.length}`);
      }

      // 优先级3：兼容豆包/其他厂商可能的 content 字符串格式
      if (!text && json && typeof json.content === 'string') {
        text = json.content;
      }
      // 优先级4：兼容 choices[0].content 字符串格式（部分老模型返回）
      if (!text && json && json.choices && json.choices[0] && typeof json.choices[0].content === 'string') {
        text = json.choices[0].content;
      }
      // 优先级5：reasoning_content（豆包推理模型可能把正文放在这里）
      if (!text && json && json.choices && json.choices[0] && json.choices[0].message) {
        const m = json.choices[0].message;
        if (m.reasoning_content && typeof m.reasoning_content === 'string') text = m.reasoning_content;
      }
      // 优先级6：tool_calls / function_call 的 arguments 里有内容
      if (!text && json && json.choices && json.choices[0] && json.choices[0].message) {
        const m = json.choices[0].message;
        if (m.tool_calls && Array.isArray(m.tool_calls)) {
          text = m.tool_calls.map((t) => {
            const args = t.function && t.function.arguments;
            return typeof args === 'string' ? args : JSON.stringify(args);
          }).join('\n');
        }
      }
      // 优先级7：choices[0].delta.content（流式非流式混用？）
      if (!text && json && json.choices && json.choices[0] && json.choices[0].delta) {
        if (typeof json.choices[0].delta.content === 'string') text = json.choices[0].delta.content;
      }
      // 优先级8：choices[0].message.content 是数组（多模态）
      if (!text && json && json.choices && json.choices[0] && json.choices[0].message && Array.isArray(json.choices[0].message.content)) {
        text = json.choices[0].message.content
          .filter((c) => c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text)
          .join('\n');
      }
    }
    if (!text) {
      // 完整打印原始响应体（不截断），便于排查豆包等厂商的非标准返回
      const rawStr = JSON.stringify(json);
      logf('error', `模型响应为空，HTTP status=${status}, 完整响应体长度=${rawStr.length}`);
      logf('error', `完整响应体内容: ${rawStr}`);
      // 额外打印前几层 key，快速判断格式
      if (json && typeof json === 'object') {
        logf('error', `响应顶层 keys: ${Object.keys(json).join(',')}`);
        if (json.choices && json.choices[0]) {
          const c0 = json.choices[0];
          logf('error', `choices[0] keys: ${Object.keys(c0).join(',')}`);
          if (c0.message) logf('error', `choices[0].message keys: ${Object.keys(c0.message).join(',')}`);
          if (c0.delta) logf('error', `choices[0].delta keys: ${Object.keys(c0.delta).join(',')}`);
        }
        if (json.output && Array.isArray(json.output) && json.output[0]) {
          logf('error', `output[0] keys: ${Object.keys(json.output[0]).join(',')}`);
        }
      }
      return { code: 1, message: '模型响应为空（HTTP 200 但内容体无 choices[0].message.content），请检查 baseURL / model 配置', data: null };
    }
    return { code: 0, message: 'ok', data: { text, usage } };
  } catch (e) {
    const msg = (e && e.message) || '代理调用失败';
    logf('error', `转发异常: ${msg}`);
    return { code: 1, message: msg, data: null };
  }
};
