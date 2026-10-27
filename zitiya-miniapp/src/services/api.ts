// 后端 HTTP 封装 —— FastAPI 数据服务器
// 地址优先级：构建期注入的 API_BASE_URL（公网/H5 部署用）> sceneConfig 配置 > 默认 localhost:8080

import { getApiBase } from './sceneConfig';

declare const API_BASE_URL: string;
const API_BASE = (typeof API_BASE_URL !== 'undefined' && API_BASE_URL) || getApiBase();

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} 返回 ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} 返回 ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} 返回 ${res.status}`);
  return res.json() as Promise<T>;
}

export { API_BASE };
