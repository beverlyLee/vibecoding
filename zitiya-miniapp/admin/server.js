// 嘴替鸭后台管理系统 —— 零依赖 Node 服务（仅用内置模块）
// 启动：node server.js  (默认 http://localhost:8787)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { api } = require('./lib/model');
const crawl = require('./lib/crawl');

const PORT = process.env.ADMIN_PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// 路由表：method path -> handler(req,res,params,body)
const routes = [];
function route(method, pattern, handler) {
  // pattern 形如 /api/intents/:key
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler });
}

// ---- 路由定义 ----
route('GET', '/api/overview', async () => api.getOverview());

route('GET', '/api/intents', async () => api.listIntents());
route('POST', '/api/intents', async (_r, _res, _p, body) => api.addIntent(body));
route('PUT', '/api/intents/:key', async (_r, _res, p, body) => api.updateIntent(decodeURIComponent(p.key), body));
route('DELETE', '/api/intents/:key', async (_r, _res, p) => api.removeIntent(decodeURIComponent(p.key)));

route('PUT', '/api/intents/:key/keywords', async (_r, _res, p, body) => api.setKeywords(decodeURIComponent(p.key), body.keywords || []));
route('POST', '/api/intents/:key/keywords', async (_r, _res, p, body) => {
  if (body.action === 'remove') return api.removeKeyword(decodeURIComponent(p.key), body.kw);
  return api.addKeyword(decodeURIComponent(p.key), body.kw);
});

route('GET', '/api/quotes', async () => api.listQuotes());
route('POST', '/api/quotes', async (_r, _res, _p, body) => api.addQuote(body));
route('DELETE', '/api/quotes/:id', async (_r, _res, p) => api.removeQuote(decodeURIComponent(p.id)));

route('GET', '/api/topics', async () => api.listTopics());
route('PUT', '/api/topics', async (_r, _res, _p, body) => api.setTopics(body.topics || []));
route('POST', '/api/topics', async (_r, _res, _p, body) => api.addTopic(body.topic));
route('DELETE', '/api/topics/:topic', async (_r, _res, p) => api.removeTopic(decodeURIComponent(p.topic)));

route('GET', '/api/prompts', async () => api.listPrompts());
route('PUT', '/api/prompts/:key', async (_r, _res, p, body) => api.setPrompt(decodeURIComponent(p.key), body.value || ''));
route('DELETE', '/api/prompts/:key', async (_r, _res, p) => api.resetPrompt(decodeURIComponent(p.key)));

route('GET', '/api/presets', async () => api.listPresets());
route('POST', '/api/presets', async (_r, _res, _p, body) => api.addPreset(body));
route('PUT', '/api/presets/:key', async (_r, _res, p, body) => api.updatePreset(decodeURIComponent(p.key), body));
route('DELETE', '/api/presets/:key', async (_r, _res, p) => api.removePreset(decodeURIComponent(p.key)));

route('GET', '/api/funnel', async () => api.getFunnel());
route('PUT', '/api/funnel', async (_r, _res, _p, body) => api.setFunnel(body));

// 模型参数（温度/maxTokens/超时，按用途档位）
route('GET', '/api/model-params', async () => api.getModelParams());
route('PUT', '/api/model-params/:purpose', async (_r, _res, p, body) => api.setModelParams(decodeURIComponent(p.purpose), body));
route('DELETE', '/api/model-params/:purpose', async (_r, _res, p) => api.resetModelParams(decodeURIComponent(p.purpose)));

// 每日语录 TTL（天）
route('GET', '/api/daily-ttl', async () => api.getDailyTTL());
route('PUT', '/api/daily-ttl', async (_r, _res, _p, body) => api.setDailyTTL(body.days ?? body.dailyQuoteTTLDays ?? body));

// 每日入库上限（条）
route('GET', '/api/daily-limit', async () => api.getDailyLimit());
route('PUT', '/api/daily-limit', async (_r, _res, _p, body) => api.setDailyLimit(body.limit ?? body.dailyQuoteLimit ?? body));
route('GET', '/api/api-base', async () => api.getApiBase());
route('PUT', '/api/api-base', async (_r, _res, _p, body) => api.setApiBase(body.apiBase ?? body));

// 爬虫手动触发（调用微信云函数 daily_crawler）
route('GET', '/api/crawl/config', async () => crawl.getConfigMasked());
route('PUT', '/api/crawl/config', async (_r, _res, _p, body) => crawl.saveConfig(body));
route('POST', '/api/crawl/trigger', async (_r, _res, _p, body) => {
  const topics = Array.isArray(body && body.topics) && body.topics.length
    ? body.topics
    : await api.listTopics(); // 未显式传则用后台当前话题列表
  const limit = await api.getDailyLimit(); // 后台配置的每日入库上限
  return crawl.startCrawl(topics, limit);
});
route('GET', '/api/crawl/status/:id', async (_r, _res, p) => {
  const job = crawl.getJob(decodeURIComponent(p.id));
  if (!job) return { status: 'notfound', id: decodeURIComponent(p.id) };
  return job;
});

route('GET', '/api/attack-scenes', async () => api.listAttackScenes());
route('POST', '/api/attack-scenes', async (_r, _res, _p, body) => api.addAttackScene(body));
route('PUT', '/api/attack-scenes/:id', async (_r, _res, p, body) => api.updateAttackScene(decodeURIComponent(p.id), body));
route('DELETE', '/api/attack-scenes/:id', async (_r, _res, p) => api.removeAttackScene(decodeURIComponent(p.id)));

route('GET', '/api/attack-categories', async () => api.listAttackCategories());
route('PUT', '/api/attack-categories', async (_r, _res, _p, body) => api.setAttackCategories(body.categories || []));
route('POST', '/api/attack-categories', async (_r, _res, _p, body) => api.addAttackCategory(body.category));
route('DELETE', '/api/attack-categories/:cat', async (_r, _res, p) => api.removeAttackCategory(decodeURIComponent(p.cat)));

route('GET', '/api/check', async (req) => {
  const u = new URL(req.url, 'http://x').searchParams.get('utterance') || '';
  return api.check(u);
});

route('GET', '/api/export/localstorage', async () => api.exportLocalStorage());
route('GET', '/api/export/clouddb', async () => api.exportCloudDB());
route('POST', '/api/import', async (_r, _res, _p, body) => api.importPatch(body));

// ---- 请求分发 ----
const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (!urlPath.startsWith('/api/')) {
    return serveStatic(req, res, urlPath);
  }
  try {
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.rx.exec(urlPath);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      const result = await r.handler(req, res, params, body);
      return send(res, 200, result);
    }
    return send(res, 404, { error: 'no route', path: urlPath });
  } catch (e) {
    console.error('[server] 错误:', e);
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`🦆 嘴替鸭后台已启动: http://localhost:${PORT}`);
});
