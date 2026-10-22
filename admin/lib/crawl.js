// 爬虫触发模块：通过微信云开发 invokecloudfunction 远程调用 daily_crawler 云函数
// 凭据来源（优先级）：环境变量 ZUITIYA_WX_APPID / ZUITIYA_WX_APP_SECRET / ZUITIYA_WX_ENV
//                   → 否则 admin/data/crawl_config.json
// 零依赖，仅用 Node 内置 https 模块。

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'crawl_config.json');
const WX_TOKEN_API = 'https://api.weixin.qq.com/cgi-bin/token';
const WX_INVOKE_API = 'https://api.weixin.qq.com/tcb/invokecloudfunction';

// jobId -> { id, status, startedAt, finishedAt, log, result, error }
const jobs = new Map();
let tokenCache = { token: null, expireAt: 0 };

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  const env = {
    appId: process.env.ZUITIYA_WX_APPID || '',
    secret: process.env.ZUITIYA_WX_APP_SECRET || '',
    env: process.env.ZUITIYA_WX_ENV || ''
  };
  if (env.appId && env.secret && env.env) return env;
  ensureDataDir();
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { appId: c.appId || '', secret: c.secret || '', env: c.env || '' };
    } catch (e) { /* 损坏则当作未配置 */ }
  }
  return { appId: '', secret: '', env: '' };
}

function saveConfig(cfg) {
  ensureDataDir();
  const c = { appId: cfg.appId || '', secret: cfg.secret || '', env: cfg.env || '' };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));
  tokenCache = { token: null, expireAt: 0 }; // 凭据变更，重置 token 缓存
  return masked(c);
}

function masked(c) {
  const id = c.appId || '';
  const m = id ? (id.slice(0, 3) + '****' + id.slice(-4)) : '';
  return {
    configured: Boolean(c.appId && c.secret && c.env),
    appId: id,
    appIdMasked: m,
    env: c.env || ''
  };
}

function getConfigMasked() { return masked(loadConfig()); }

// 通用 JSON HTTPS 请求
function httpsJson(urlStr, method, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(e); }
    const data = bodyObj ? JSON.stringify(bodyObj) : null;
    const opts = {
      method: method || 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(buf); }
        catch (e) { return reject(new Error('微信接口返回非 JSON: ' + buf.slice(0, 200))); }
        resolve(json);
      });
    });
    req.on('error', (e) => reject(e));
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('微信接口请求超时')));
    if (data) req.write(data);
    req.end();
  });
}

async function getAccessToken(cfg) {
  if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token;
  const url = `${WX_TOKEN_API}?grant_type=client_credential&appid=${encodeURIComponent(cfg.appId)}&secret=${encodeURIComponent(cfg.secret)}`;
  const r = await httpsJson(url, 'GET', null, 15000);
  if (r.errcode) throw new Error(`获取 access_token 失败: ${r.errcode} ${r.errmsg}`);
  if (!r.access_token) throw new Error('获取 access_token 失败: 返回中无 access_token');
  const ttl = (Number(r.expires_in) || 7200) * 1000 - 300000; // 提前 5 分钟过期
  tokenCache = { token: r.access_token, expireAt: Date.now() + Math.max(ttl, 60000) };
  return tokenCache.token;
}

async function invokeCrawler(cfg, topics, limit) {
  const token = await getAccessToken(cfg);
  const url = `${WX_INVOKE_API}?access_token=${encodeURIComponent(token)}&env=${encodeURIComponent(cfg.env)}&name=daily_crawler`;
  const body = {};
  if (topics && topics.length) body.topics = topics;
  if (limit != null) body.limit = limit; // 每日入库上限，覆盖云函数默认 100
  const r = await httpsJson(url, 'POST', body, 180000);
  if (r.errcode) throw new Error(`调用云函数失败: ${r.errcode} ${r.errmsg}`);
  let respData = null;
  if (r.resp_data) {
    try { respData = JSON.parse(r.resp_data); }
    catch (e) { respData = { raw: r.resp_data }; }
  }
  return { errcode: r.errcode, errmsg: r.errmsg, respData };
}

function genId() {
  return 'job_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// 启动一次抓取（异步），立即返回 jobId；前端用 status 接口轮询
function startCrawl(topics, limit) {
  const cfg = loadConfig();
  const id = genId();
  const job = {
    id, status: 'running', startedAt: Date.now(), finishedAt: null,
    topics: Array.isArray(topics) ? topics : [], log: [], result: null, error: null
  };
  jobs.set(id, job);
  (async () => {
    if (!cfg.appId || !cfg.secret || !cfg.env) {
      job.status = 'error';
      job.error = '微信云凭据未配置：请先在「爬虫话题」页点「配置微信云」填写 appid / secret / 云环境 env。';
      job.finishedAt = Date.now();
      return;
    }
    job.log.push('已读取微信云凭据，正在获取 access_token…');
    try {
      const out = await invokeCrawler(cfg, topics, limit);
      job.log.push('云函数已返回结果。');
      job.result = out;
      job.status = 'done';
    } catch (e) {
      job.status = 'error';
      job.error = e.message;
    }
    job.finishedAt = Date.now();
  })();
  return { jobId: id };
}

function getJob(id) { return jobs.get(id) || null; }

module.exports = { loadConfig, saveConfig, getConfigMasked, startCrawl, getJob };
