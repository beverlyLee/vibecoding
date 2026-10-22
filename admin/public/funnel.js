// 漏斗参数（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 漏斗参数 ----------
  async renderFunnel() {
    const f = await this.api('GET', '/api/funnel');
    const field = (k, label, hint) => `
      <div class="field" style="margin-bottom:12px">
        <label>${label}</label>
        <input class="input" type="number" step="0.1" id="funnel_${k}" value="${f[k]}">
        <span class="hint">${hint}</span>
      </div>`;
    return `
      <div class="notice">漏斗参数控制语录三层匹配（固定库/每日库/LLM）的打分与命中阈值。覆盖后需在小程序侧同步读取（本次已做兼容改造）。</div>
      ${field('minScore', '命中阈值 minScore', '语录 baseScore ≥ 此值才算命中，默认 2')}
      ${field('intentMatchScore', '意图精准命中加分', '语录 intent_key 命中意图，默认 10')}
      ${field('quoteKeywordScore', '语录关键词命中加分', '语录自带关键词命中，每条 +2')}
      ${field('bidirectionalScore', '双向命中加分', '输入与语录都含某意图关键词，+3')}
      ${field('tierFixed', '固定库排序加权', '已命中语录间排序用，默认 2')}
      ${field('tierDaily', '每日库排序加权', '默认 1')}
      <button class="btn" data-action="saveFunnel">保存漏斗参数</button>`;
  },

  async saveFunnel() {
    const keys = ['minScore', 'intentMatchScore', 'quoteKeywordScore', 'bidirectionalScore', 'tierFixed', 'tierDaily'];
    const body = {};
    keys.forEach(k => body[k] = document.getElementById('funnel_' + k).value);
    await this.api('PUT', '/api/funnel', body);
    this.toast('已保存');
  }
});
