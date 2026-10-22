// 嘴替鸭后台管理 SPA —— App 外壳与调度（原生 ES 模块，无构建）
// 各功能模块通过 Object.assign(App, {...}) 把 render/handler 挂到 App 上，行为不变。
export const App = {
  tab: 'overview',
  tabs: [
    { id: 'overview', label: '概览' },
    { id: 'intents', label: '意图管理' },
    { id: 'quotes', label: '固定语录' },
    { id: 'topics', label: '爬虫话题' },
    { id: 'attack', label: '出招场景' },
    { id: 'presets', label: '模型厂商' },
    { id: 'prompts', label: '提示词' },
    { id: 'funnel', label: '漏斗参数' },
    { id: 'runtime', label: '运行时参数' },
    { id: 'io', label: '导入/导出' }
  ],

  async api(method, path, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(path, opt);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(() => t.classList.remove('show'), 1800);
  },

  init() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = this.tabs.map(t =>
      `<div class="tab ${t.id === this.tab ? 'active' : ''}" data-action="tab" data-tab="${t.id}">${t.label}</div>`
    ).join('');
    document.addEventListener('click', (e) => this.onClick(e));
    this.go(this.tab);
  },

  go(tab) {
    this.tab = tab;
    document.querySelectorAll('.tab').forEach(el =>
      el.classList.toggle('active', el.dataset.tab === tab));
    this.render();
  },

  async render() {
    this.stopCrawlPoll();
    const c = document.getElementById('content');
    try {
      if (this.tab === 'overview') c.innerHTML = await this.renderOverview();
      else if (this.tab === 'intents') c.innerHTML = await this.renderIntents();
      else if (this.tab === 'quotes') c.innerHTML = await this.renderQuotes();
      else if (this.tab === 'topics') c.innerHTML = await this.renderTopics();
      else if (this.tab === 'attack') c.innerHTML = await this.renderAttack();
      else if (this.tab === 'presets') c.innerHTML = await this.renderPresets();
      else if (this.tab === 'prompts') c.innerHTML = await this.renderPrompts();
      else if (this.tab === 'funnel') c.innerHTML = await this.renderFunnel();
      else if (this.tab === 'runtime') c.innerHTML = await this.renderRuntime();
      else if (this.tab === 'io') c.innerHTML = await this.renderIO();
    } catch (err) {
      c.innerHTML = `<div class="notice">加载失败：${this.esc(err.message)}</div>`;
    }
  },

  refreshAll() { this.render(); this.toast('已刷新'); },

  async onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    try {
      if (a === 'tab') this.go(el.dataset.tab);
      else if (a === 'addIntent') this.modalIntent();
      else if (a === 'editIntent') this.modalIntent(el.dataset.key);
      else if (a === 'delIntent') await this.delIntent(el.dataset.key);
      else if (a === 'kwIntent') this.modalKeywords(el.dataset.key);
      else if (a === 'addKw') await this.addKw(el.dataset.key);
      else if (a === 'delKw') await this.delKw(el.dataset.key, el.dataset.kw);
      else if (a === 'addQuote') this.modalQuote();
      else if (a === 'delQuote') await this.delQuote(el.dataset.id);
      else if (a === 'addTopic') await this.addTopic();
      else if (a === 'delTopic') await this.delTopic(el.dataset.topic);
      else if (a === 'crawlConfig') this.modalCrawlConfig();
      else if (a === 'crawlSaveConfig') await this.saveCrawlConfig();
      else if (a === 'crawlRun') await this.runCrawl();
      else if (a === 'addAttackScene') this.modalAttackScene();
      else if (a === 'editAttackScene') this.modalAttackScene(el.dataset.id);
      else if (a === 'delAttackScene') await this.delAttackScene(el.dataset.id);
      else if (a === 'addAttackCategory') await this.addAttackCategory();
      else if (a === 'delAttackCategory') await this.delAttackCategory(el.dataset.cat);
      else if (a === 'addPreset') this.modalPreset();
      else if (a === 'editPreset') this.modalPreset(el.dataset.key);
      else if (a === 'delPreset') await this.delPreset(el.dataset.key);
      else if (a === 'savePrompt') await this.savePrompt(el.dataset.key);
      else if (a === 'resetPrompt') await this.resetPrompt(el.dataset.key);
      else if (a === 'addPrompt') this.modalPrompt();
      else if (a === 'saveFunnel') await this.saveFunnel();
      else if (a === 'saveModelParams') await this.saveModelParams();
      else if (a === 'resetModelParams') await this.resetModelParams(el.dataset.purpose);
      else if (a === 'saveDailyTTL') await this.saveDailyTTL();
      else if (a === 'saveDailyLimit') await this.saveDailyLimit();
      else if (a === 'exportLS') this.download('zuitiya_scene_config.json', await this.api('GET', '/api/export/localstorage'));
      else if (a === 'exportCloud') this.download('scene_config_clouddb.json', await this.api('GET', '/api/export/clouddb'));
      else if (a === 'importPatch') await this.importPatch();
      else if (a === 'closeModal') this.closeModal();
      else if (a === 'saveIntent') await this.saveIntent();
      else if (a === 'saveQuote') await this.saveQuote();
      else if (a === 'savePreset') await this.savePreset();
      else if (a === 'saveNewPrompt') await this.saveNewPrompt();
      else if (a === 'saveAttackScene') await this.saveAttackScene();
    } catch (err) {
      this.toast('操作失败：' + err.message);
    }
  },

  // ---------- 概览 ----------
  async renderOverview() {
    const o = await this.api('GET', '/api/overview');
    const d = o.defaults, p = o.patch, t = o.totals;
    const card = (num, lab, sub) => `<div class="card"><div class="num">${num}</div><div class="lab">${lab}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    return `
      <div class="notice">后台读取小程序源码中的默认值作为基准，你的改动以「patch」形式保存，导出后可直接贴回小程序 LocalStorage 或云数据库。所有改动实时落盘到 <span class="mono">admin/data/scene_config.json</span>。</div>
      <h2 class="section-title">配置概览</h2>
      <div class="cards">
        ${card(t.intents, '意图总数', `默认 ${d.intents} · 覆盖/新增 ${p.keywordOverrides + p.intentOverrides + p.customIntents}`)}
        ${card(t.quotes, '语录总数', `默认 ${d.quotes} · 自定义 ${p.customQuotes}`)}
        ${card(t.topics, '爬虫话题', `默认 ${d.topics} · 自定义 ${p.crawlTopics}`)}
        ${card(d.presets + p.presets, '模型厂商', `默认 ${d.presets} · 覆盖/新增 ${p.presets}`)}
        ${card(d.prompts + p.prompts, '提示词', `默认 ${d.prompts} · 覆盖 ${p.prompts}`)}
        ${card(p.funnelConfig, '漏斗参数覆盖', `共 ${p.funnelConfig} 项`)}
      </div>
      <div class="hint" style="margin-top:18px">提示：下方 Tab 可逐项查看与更改。修改「提示词」「模型厂商」「漏斗参数」后，需把导出文件贴回小程序（或同步到云数据库）才能生效。</div>`;
  },

  // ---------- 爬虫手动触发（轮询控制，放在外壳，供 render 清理）----------
  stopCrawlPoll() {
    if (this._crawlTimer) { clearInterval(this._crawlTimer); this._crawlTimer = null; }
  },

  // ---------- modal ----------
  modal(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modalMask').classList.add('show');
  },
  closeModal() {
    document.getElementById('modalMask').classList.remove('show');
  },

  download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};
