// 意图管理（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 意图 ----------
  async renderIntents() {
    const list = await this.api('GET', '/api/intents');
    const rows = list.map(r => {
      const badge = r.origin === 'custom'
        ? `<span class="badge custom">自定义</span>`
        : (r.overridden ? `<span class="badge ov">已覆盖</span>` : `<span class="badge def">默认</span>`);
      const del = r.origin === 'custom'
        ? `<button class="btn danger sm" data-action="delIntent" data-key="${this.esc(r.key)}">删除</button>`
        : `<button class="btn gray sm" data-action="delIntent" data-key="${this.esc(r.key)}">还原默认</button>`;
      return `<tr>
        <td class="mono">${this.esc(r.key)}</td>
        <td>${this.esc(r.name)} ${badge}</td>
        <td>${this.esc(r.intensity)}</td>
        <td>${r.weight}</td>
        <td>${this.esc(r.situation).slice(0, 40)}${r.situation.length > 40 ? '…' : ''}</td>
        <td>${r.keywords.length} 个</td>
        <td class="pill-actions">
          <button class="btn ghost sm" data-action="editIntent" data-key="${this.esc(r.key)}">编辑</button>
          <button class="btn ghost sm" data-action="kwIntent" data-key="${this.esc(r.key)}">关键词</button>
          ${del}
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="toolbar">
        <button class="btn" data-action="addIntent">＋ 新增意图</button>
        <span class="hint">默认意图不可删除，只能「编辑」（生成覆盖）或「还原默认」。</span>
      </div>
      <table>
        <thead><tr><th>key</th><th>名称</th><th>强度</th><th>权重</th><th>处境</th><th>关键词</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="empty">暂无数据</td></tr>'}</tbody>
      </table>`;
  },

  modalIntent(key) {
    const self = this;
    if (!key) {
      this.modal(`
        <h3>新增意图</h3>
        <div class="row">
          <div class="field"><label>名称（必填）</label><input class="input" id="m_name" placeholder="如：催买房"></div>
          <div class="field"><label>key（可选，留空自动生成）</label><input class="input" id="m_key" placeholder="如：buy_house"></div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>关键词（逗号分隔）</label><input class="input" id="m_kw" placeholder="买房,首付,还贷"></div>
        <div class="row">
          <div class="field"><label>权重</label><input class="input" id="m_weight" type="number" step="0.1" value="1.0"></div>
          <div class="field"><label>强度</label>
            <select class="input" id="m_intensity"><option>low</option><option selected>medium</option><option>high</option></select>
          </div>
        </div>
        <div class="field"><label>处境说明</label><input class="input" id="m_situation" placeholder="应对要点"></div>
        <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="saveIntent">保存</button></div>
      `);
      return;
    }
    this.api('GET', '/api/intents').then(list => {
      const r = list.find(x => x.key === key);
      self.modal(`
        <h3>编辑意图：${self.esc(r.name)}</h3>
        <div class="notice">${r.origin === 'default' ? '这是默认意图，保存将生成「覆盖」，可随时还原默认。' : '自定义意图，保存直接修改。'}</div>
        <div class="field" style="margin-bottom:10px"><label>名称</label><input class="input" id="m_name" value="${self.esc(r.name)}"></div>
        <div class="field" style="margin-bottom:10px"><label>关键词（逗号分隔，覆盖整组）</label><input class="input" id="m_kw" value="${self.esc(r.keywords.join(','))}"></div>
        <div class="row">
          <div class="field"><label>权重</label><input class="input" id="m_weight" type="number" step="0.1" value="${r.weight}"></div>
          <div class="field"><label>强度</label>
            <select class="input" id="m_intensity">${['low','medium','high'].map(i=>`<option ${i===r.intensity?'selected':''}>${i}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field"><label>处境说明</label><input class="input" id="m_situation" value="${self.esc(r.situation)}"></div>
        <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="saveIntent" data-key="${self.esc(key)}">保存覆盖</button></div>
      `);
    });
  },

  async saveIntent() {
    const name = document.getElementById('m_name').value.trim();
    const kw = document.getElementById('m_kw').value;
    const keywords = kw.split(',').map(s => s.trim()).filter(Boolean);
    const weight = parseFloat(document.getElementById('m_weight').value) || 1.0;
    const intensity = document.getElementById('m_intensity').value;
    const situation = document.getElementById('m_situation').value.trim();
    const keyEl = document.querySelector('[data-action="saveIntent"]').dataset.key;
    if (keyEl) {
      await this.api('PUT', '/api/intents/' + encodeURIComponent(keyEl), { name, keywords, weight, intensity, situation });
    } else {
      if (!name) { this.toast('请填写名称'); return; }
      const key = document.getElementById('m_key').value.trim();
      await this.api('POST', '/api/intents', { name, key, keywords, weight, intensity, situation });
    }
    this.closeModal();
    this.toast('已保存');
    this.render();
  },

  async delIntent(key) {
    const r = await this.api('DELETE', '/api/intents/' + encodeURIComponent(key));
    this.toast(r.restored ? '已还原默认' : (r.ok ? '已删除' : (r.msg || '失败')));
    this.render();
  },

  async modalKeywords(key) {
    const r = (await this.api('GET', '/api/intents')).find(x => x.key === key);
    const chips = r.keywords.map(k =>
      `<span class="chip">${this.esc(k)} <span class="x" data-action="delKw" data-key="${this.esc(key)}" data-kw="${this.esc(k)}">×</span></span>`
    ).join('');
    this.modal(`
      <h3>关键词管理：${this.esc(r.name)}</h3>
      <div class="chips" style="margin-bottom:12px">${chips || '<span class="hint">暂无关键词</span>'}</div>
      <div class="kw-input-row">
        <input class="input" id="kw_new" placeholder="输入关键词后回车/添加" style="flex:1">
        <button class="btn" data-action="addKw" data-key="${this.esc(key)}">添加</button>
      </div>
      <div class="actions"><button class="btn gray" data-action="closeModal">关闭</button></div>
    `);
  },

  async addKw(key) {
    const v = document.getElementById('kw_new').value.trim();
    if (!v) return;
    await this.api('POST', '/api/intents/' + encodeURIComponent(key) + '/keywords', { kw: v });
    this.toast('已添加');
    this.modalKeywords(key);
    this.render();
  },

  async delKw(key, kw) {
    await this.api('POST', '/api/intents/' + encodeURIComponent(key) + '/keywords', { action: 'remove', kw });
    this.toast('已移除');
    this.modalKeywords(key);
    this.render();
  }
});
