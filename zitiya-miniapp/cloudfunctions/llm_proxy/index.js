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

const http = require('http');
const https = require('https');
const { URL } = require('url');

function logf(level, msg) {
  console.log(JSON.stringify({ ts: Date.now(), level, fn: 'llm_proxy', msg }));
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
  const suffix = isAnthropic ? '/v1/messages' : '/chat/completions';
  const targetUrl = cleanBase + suffix;

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
    body = { model: resolvedModel, messages, temperature, max_tokens: maxTokens, stream: false };
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
      text =
        (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      usage = json && json.usage
        ? { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens }
        : undefined;
    }
    if (!text) {
      logf('warn', `模型响应为空，原始响应体: ${JSON.stringify(json).slice(0, 500)}`);
      return { code: 1, message: '模型响应为空（HTTP 200 但内容体无 choices[0].message.content），请检查 baseURL / model 配置', data: null };
    }
    return { code: 0, message: 'ok', data: { text, usage } };
  } catch (e) {
    const msg = (e && e.message) || '代理调用失败';
    logf('error', `转发异常: ${msg}`);
    return { code: 1, message: msg, data: null };
  }
};
