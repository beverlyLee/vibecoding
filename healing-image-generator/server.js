/* server.js · 零依赖生产服务器：静态托管 + AI 供应商反向代理。
 *
 * 为什么需要它：
 *   火山方舟（ark）API 不返回 CORS 头，浏览器无法直连。开发时由 vite 的
 *   /proxy-ark 代理绕过；部署到纯静态托管时该代理不存在，AI 功能会 404。
 *   本服务器在「一个 HTTP 端口」内同时提供静态文件与代理，因此适用于
 *   WorkBuddy 内置发布、任意 VPS、Render / Railway / Fly.io 等。
 *
 * 用法：PORT=3000 node server.js   （默认 3000，监听 0.0.0.0）
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;

/* ── 代理白名单：路径前缀 → 固定上游 origin ──────────────────
 * 目标地址硬编码，不接受请求参数指定，避免开放代理（SSRF）。
 * 新增供应商时在这里加一行即可，与 engine/providers.ts 的 needsProxy 对应。 */
const PROXY_TARGETS = {
  '/proxy-ark': 'https://ark.cn-beijing.volces.com',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/** 把 /proxy-ark/api/v3/chat/completions 转发到上游同名路径 */
function proxy(req, res, prefix) {
  const origin = PROXY_TARGETS[prefix];
  const rest = req.url.slice(prefix.length) || '/';
  const upstream = new URL(rest, origin);

  const headers = { ...req.headers };
  delete headers.host; // 交给 URL 决定，否则上游虚拟主机路由会错
  delete headers['accept-encoding']; // 不解压，直接透传原始字节

  // 部分托管平台边缘层会剥掉标准 Authorization 头；前端因此在走代理时
  // 额外携带 x-proxy-authorization，这里把它还原为 Authorization 再转发。
  if (headers['x-proxy-authorization']) {
    headers.authorization = headers['x-proxy-authorization'];
    delete headers['x-proxy-authorization'];
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstreamReq = https.request(
      upstream,
      { method: req.method, headers: { ...headers, 'content-length': body.length } },
      (upRes) => {
        // 透传上游状态码与响应头（去掉传输层相关头，交给本层处理）
        const out = { ...upRes.headers };
        delete out['transfer-encoding'];
        delete out['content-length'];
        delete out['content-encoding'];
        res.writeHead(upRes.statusCode || 502, out);
        upRes.pipe(res);
      },
    );
    upstreamReq.on('error', (err) => {
      console.error('[proxy]', prefix, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      }
      res.end(JSON.stringify({ error: `上游请求失败：${err.message}` }));
    });
    upstreamReq.setTimeout(120000, () => {
      upstreamReq.destroy(new Error('上游超时（120s）'));
    });
    if (body.length) upstreamReq.write(body);
    upstreamReq.end();
  });
}

/** 静态文件服务 + SPA 回退 */
function serveStatic(req, res, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let filePath = path.join(DIST, clean);

  // 目录穿越防护：解析后必须仍在 DIST 内
  if (!path.resolve(filePath).startsWith(path.resolve(DIST))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html'); // SPA 回退
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('未找到构建产物，请先运行 npm run build');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashed = /-[A-Za-z0-9_]{8,}\./.test(path.basename(filePath)); // 带内容指纹，可长缓存
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

http
  .createServer((req, res) => {
    const urlPath = req.url || '/';
    const prefix = Object.keys(PROXY_TARGETS).find(
      (p) => urlPath === p || urlPath.startsWith(p + '/'),
    );
    if (prefix) proxy(req, res, prefix);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, urlPath);
    else res.writeHead(405).end('Method Not Allowed');
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`治愈系图片生成器 → http://0.0.0.0:${PORT}`);
    console.log(`代理规则：${Object.entries(PROXY_TARGETS).map(([p, o]) => `${p}/* → ${o}/*`).join('，')}`);
  });
