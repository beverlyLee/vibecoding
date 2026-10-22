// 爬虫话题 + 立即抓取（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 爬虫话题 ----------
  async renderTopics() {
    const [list, ccfg] = await Promise.all([
      this.api('GET', '/api/topics'),
      this.api('GET', '/api/crawl/config')
    ]);
    const chips = list.map(t =>
      `<span class="chip">${this.esc(t)} <span class="x" data-action="delTopic" data-topic="${this.esc(t)}">×</span></span>`
    ).join('');
    const cfgBadge = ccfg.configured
      ? `<span class="badge def">已配置</span> <span class="mono">${this.esc(ccfg.appIdMasked)}</span> · env=<span class="mono">${this.esc(ccfg.env)}</span>`
      : `<span class="badge ov">未配置微信云凭据</span>`;
    return `
      <div class="notice">爬虫话题用于云函数 daily_crawler 每日爬取微博话题。导出「云数据库文档」后上传到云数据库 scene_config（_id=main）即可生效；也兼容小程序 LocalStorage。</div>

      <div class="crawl-box" id="crawl_box">
        <div class="crawl-head">
          <span class="crawl-title">🕷️ 立即抓取一次</span>
          <button class="btn ghost sm" data-action="crawlConfig">配置微信云</button>
        </div>
        <div class="crawl-meta">微信云凭据：${cfgBadge}</div>
        <div class="toolbar" style="margin-top:8px">
          <button class="btn" data-action="crawlRun">▶ 发送爬虫请求</button>
          <span class="hint">点击后向云函数 daily_crawler 发送一次抓取，使用上方「当前话题」列表。云函数爬完微博话题→关键词过滤→入库后返回结果。</span>
        </div>
        <div class="crawl-result" id="crawl_result"></div>
      </div>

      <div class="toolbar" style="margin-top:16px">
        <input class="input" id="topic_new" placeholder="新增话题，如：职场边界" style="flex:1;min-width:200px">
        <button class="btn" data-action="addTopic">添加</button>
      </div>
      <h2 class="section-title">当前话题 <span class="count">${list.length} 个</span></h2>
      <div class="chips">${chips || '<span class="hint">暂无</span>'}</div>`;
  },

  async addTopic() {
    const v = document.getElementById('topic_new').value.trim();
    if (!v) return;
    await this.api('POST', '/api/topics', { topic: v });
    this.toast('已添加');
    this.render();
  },
  async delTopic(topic) {
    await this.api('DELETE', '/api/topics/' + encodeURIComponent(topic));
    this.toast('已移除');
    this.render();
  },

  // ---------- 爬虫手动触发 ----------
  async runCrawl() {
    this.stopCrawlPoll();
    const box = document.getElementById('crawl_result');
    if (box) box.innerHTML = `<div class="notice" style="margin:0">请求已发送，等待云函数返回…（云函数爬微博话题可能耗时数十秒）</div>`;
    let job;
    try {
      job = await this.api('POST', '/api/crawl/trigger', {});
    } catch (e) {
      if (box) box.innerHTML = `<div class="notice" style="margin:0;background:#fdeceb;border-color:#f0c9c7;color:#b9443f">触发失败：${this.esc(e.message)}</div>`;
      return;
    }
    const id = job.jobId;
    this._crawlTimer = setInterval(async () => {
      try {
        const s = await this.api('GET', '/api/crawl/status/' + encodeURIComponent(id));
        this.renderCrawlStatus(s);
        if (s.status === 'done' || s.status === 'error' || s.status === 'notfound') {
          this.stopCrawlPoll();
        }
      } catch (e) {
        this.stopCrawlPoll();
      }
    }, 1500);
  },

  renderCrawlStatus(s) {
    const box = document.getElementById('crawl_result');
    if (!box) return;
    if (s.status === 'notfound') {
      box.innerHTML = `<div class="notice" style="margin:0;background:#fdeceb;border-color:#f0c9c7;color:#b9443f">任务不存在或已过期</div>`;
      return;
    }
    if (s.status === 'running') {
      box.innerHTML = `<div class="notice" style="margin:0">⏳ 抓取进行中… ${(s.log || []).join(' ')}</div>`;
      return;
    }
    if (s.status === 'error') {
      box.innerHTML = `<div class="notice" style="margin:0;background:#fdeceb;border-color:#f0c9c7;color:#b9443f">❌ 失败：${this.esc(s.error)}</div>`;
      return;
    }
    // done
    const d = (s.result && s.result.respData && s.result.respData.data) || {};
    const rows = [
      ['话题数', d.topics ?? '—'],
      ['原始爬取', d.rawFetched ?? '—'],
      ['关键词过滤后', d.afterAnnotate ?? '—'],
      ['本次入库', d.inserted ?? '—'],
      ['耗时(ms)', d.elapsedMs ?? '—']
    ].map(([k, v]) => `<div class="cr-item"><span class="cr-k">${k}</span><span class="cr-v">${this.esc(v)}</span></div>`).join('');
    const code = (s.result && s.result.respData && s.result.respData.code);
    const msg = (s.result && s.result.respData && s.result.respData.message) || '';
    box.innerHTML = `
      <div class="cr-ok">✅ 抓取完成 <span class="mono">(code=${this.esc(code)} ${this.esc(msg)})</span></div>
      <div class="cr-grid">${rows}</div>
      <div class="hint">本次入库的语录已写入云数据库 daily_quotes，小程序下次拉取即可见。</div>`;
  },

  modalCrawlConfig() {
    const self = this;
    this.api('GET', '/api/crawl/config').then(cfg => {
      self.modal(`
        <h3>配置微信云（用于手动触发爬虫）</h3>
        <div class="notice">凭据保存在本地 <span class="mono">admin/data/crawl_config.json</span>，不会自动提交到代码仓库。也可通过环境变量 ZUITIYA_WX_APPID / ZUITIYA_WX_APP_SECRET / ZUITIYA_WX_ENV 注入（优先级更高）。</div>
        <div class="field" style="margin-bottom:10px"><label>小程序 AppID</label><input class="input" id="cc_appid" value="${self.esc(cfg.appId || '')}" placeholder="wx 开头"></div>
        <div class="field" style="margin-bottom:10px"><label>小程序 AppSecret</label><input class="input" id="cc_secret" type="password" value="${self.esc(cfg.secret || '')}" placeholder="微信公众平台获取"></div>
        <div class="field" style="margin-bottom:10px"><label>云开发环境 ID（env）</label><input class="input" id="cc_env" value="${self.esc(cfg.env || '')}" placeholder="如 prod-1a2b3c4d"></div>
        <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="crawlSaveConfig">保存</button></div>
      `);
    });
  },

  async saveCrawlConfig() {
    const cfg = {
      appId: document.getElementById('cc_appid').value.trim(),
      secret: document.getElementById('cc_secret').value.trim(),
      env: document.getElementById('cc_env').value.trim()
    };
    if (!cfg.appId || !cfg.secret || !cfg.env) { this.toast('三项都需填写'); return; }
    await this.api('PUT', '/api/crawl/config', cfg);
    this.closeModal();
    this.toast('已保存微信云凭据');
    this.render();
  }
});
