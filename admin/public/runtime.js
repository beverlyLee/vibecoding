// 运行时参数（模型参数 + 每日 TTL + 每日入库上限）（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 运行时参数（模型参数 + 每日语录 TTL）----------
  async renderRuntime() {
    const mp = await this.api('GET', '/api/model-params');
    const ttl = await this.api('GET', '/api/daily-ttl');
    const limit = await this.api('GET', '/api/daily-limit');
    const purposeLabel = {
      default: '全局兜底 default',
      analyze: '拆招分析 analyze',
      quoteGen: '语录生成 quoteGen',
      rephrase: '换说法 rephrase',
      test: '连接测试 test'
    };
    const row = (purpose) => {
      const m = mp[purpose] || { temperature: 0.8, maxTokens: 0, timeout: 0, overridden: false };
      const badge = m.overridden ? '<span class="badge-ov">已覆盖</span>' : '<span class="badge-df">默认</span>';
      const reset = m.overridden ? `<button class="btn-sm danger" data-action="resetModelParams" data-purpose="${purpose}">还原</button>` : '';
      return `
        <div class="mp-row">
          <div class="mp-head">${purposeLabel[purpose] || purpose} ${badge} ${reset}</div>
          <div class="mp-grid">
            <div class="field"><label>温度 temperature</label><input class="input" type="number" step="0.1" id="mp_${purpose}_temperature" value="${m.temperature}"></div>
            <div class="field"><label>maxTokens</label><input class="input" type="number" step="1" id="mp_${purpose}_maxTokens" value="${m.maxTokens}"></div>
            <div class="field"><label>超时 timeout(ms)</label><input class="input" type="number" step="1000" id="mp_${purpose}_timeout" value="${m.timeout}"></div>
          </div>
        </div>`;
    };
    const purposes = ['default', 'analyze', 'quoteGen', 'rephrase', 'test'];
    return `
      <div class="notice">模型参数（温度 / maxTokens / 超时）按调用用途分档位，覆盖后小程序每次调用 LLM 都会读取。每日语录 TTL 控制前端缓存与云函数清理的过期天数；每日入库上限控制云函数 daily_crawler 每天最多写入语录库的条数（前端与云函数共用同一后台配置）。API Key 不在此处管理。</div>
      <h2 class="section-title">模型参数（按用途档位）</h2>
      ${purposes.map(row).join('')}
      <button class="btn" data-action="saveModelParams">保存模型参数</button>

      <h2 class="section-title" style="margin-top:24px">每日语录 TTL</h2>
      <div class="field" style="max-width:240px">
        <label>缓存过期天数</label>
        <input class="input" type="number" step="1" min="1" id="daily_ttl" value="${ttl}">
        <span class="hint">默认 7 天；到期语录从缓存/云库清理，前端重新拉取</span>
      </div>
      <button class="btn" data-action="saveDailyTTL">保存 TTL</button>

      <h2 class="section-title" style="margin-top:24px">每日入库上限</h2>
      <div class="field" style="max-width:240px">
        <label>云函数每日最多入库条数</label>
        <input class="input" type="number" step="1" min="1" max="500" id="daily_limit" value="${limit}">
        <span class="hint">默认 100 条；云函数 daily_crawler 排序取 Top N 入库。点「立即抓取一次」也会带上此值</span>
      </div>
      <button class="btn" data-action="saveDailyLimit">保存上限</button>`;
  },

  async saveModelParams() {
    const purposes = ['default', 'analyze', 'quoteGen', 'rephrase', 'test'];
    for (const p of purposes) {
      const body = {
        temperature: document.getElementById('mp_' + p + '_temperature').value,
        maxTokens: document.getElementById('mp_' + p + '_maxTokens').value,
        timeout: document.getElementById('mp_' + p + '_timeout').value
      };
      await this.api('PUT', '/api/model-params/' + p, body);
    }
    this.toast('模型参数已保存');
  },

  async resetModelParams(purpose) {
    await this.api('DELETE', '/api/model-params/' + encodeURIComponent(purpose));
    this.toast('已还原 ' + purpose);
    this.render();
  },

  async saveDailyTTL() {
    const v = document.getElementById('daily_ttl').value;
    const res = await this.api('PUT', '/api/daily-ttl', { days: v });
    if (res && res.ok === false) { this.toast('失败：' + (res.msg || '')); return; }
    this.toast('每日 TTL 已保存为 ' + (res && res.days != null ? res.days : v) + ' 天');
  },

  async saveDailyLimit() {
    const v = document.getElementById('daily_limit').value;
    const res = await this.api('PUT', '/api/daily-limit', { limit: v });
    if (res && res.ok === false) { this.toast('失败：' + (res.msg || '')); return; }
    this.toast('每日入库上限已保存为 ' + (res != null ? res : v) + ' 条');
  }
});
