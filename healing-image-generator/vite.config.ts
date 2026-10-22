/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from './engine/providers';

// 由供应商档案（needsProxy: true）自动生成 dev 代理：/proxy-<id>/... → 该供应商 baseUrl。
// 仅 dev server 生效；生产部署需在反向代理上配置同样规则。
const aiProxy = Object.fromEntries(
  PROVIDERS.filter(p => p.needsProxy).map(p => [
    `/proxy-${p.id}`,
    {
      target: new URL(p.baseUrl).origin, // 仅 origin；path 部分由请求路径携带
      changeOrigin: true,
      rewrite: (path: string) => path.replace(`/proxy-${p.id}`, ''),
    },
  ]),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./engine', import.meta.url)),
      '@ui': fileURLToPath(new URL('./ui', import.meta.url)),
    },
  },
  test: { environment: 'node' },
  server: { proxy: aiProxy },
});
