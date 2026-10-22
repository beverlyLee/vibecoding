// 固定语录（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 固定语录 ----------
  async renderQuotes() {
    const list = await this.api('GET', '/api/quotes');
    const rows = list.map(q => {
      const badge = q.origin === 'custom' ? `<span class="badge custom">自定义</span>` : `<span class="badge def">默认</span>`;
      const del = q.origin === 'custom'
        ? `<button class="btn danger sm" data-action="delQuote" data-id="${this.esc(q.id)}">删除</button>` : '';
      return `<tr>
        <td>${this.esc(q.content)}</td>
        <td>${this.esc(q.category)} ${badge}</td>
        <td class="mono">${(q.keywords || []).join(',') || '—'}</td>
        <td>${del || '<span class="hint">默认不可删</span>'}</td>
      </tr>`;
    }).join('');
    return `
      <div class="toolbar"><button class="btn" data-action="addQuote">＋ 新增语录</button>
        <span class="hint">默认语录来自 src/data/quotes.ts，不可删；仅能新增/删除自定义语录。</span></div>
      <table><thead><tr><th>内容</th><th>分类</th><th>关键词</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty">暂无数据</td></tr>'}</tbody></table>`;
  },

  modalQuote() {
    this.modal(`
      <h3>新增固定语录</h3>
      <div class="field" style="margin-bottom:10px"><label>内容（必填）</label><textarea class="textarea" id="q_content" placeholder="可直接照着说的回应"></textarea></div>
      <div class="row">
        <div class="field"><label>分类</label><input class="input" id="q_category" value="社区热话"></div>
        <div class="field"><label>关键词（逗号分隔）</label><input class="input" id="q_kw" placeholder="结婚,催婚"></div>
      </div>
      <div class="field"><label>备注/出处</label><input class="input" id="q_note" placeholder="适用场景说明"></div>
      <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="saveQuote">保存</button></div>
    `);
  },

  async saveQuote() {
    const content = document.getElementById('q_content').value.trim();
    if (!content) { this.toast('请填写内容'); return; }
    const category = document.getElementById('q_category').value.trim();
    const keywords = document.getElementById('q_kw').value.split(',').map(s => s.trim()).filter(Boolean);
    const note = document.getElementById('q_note').value.trim();
    await this.api('POST', '/api/quotes', { content, category, keywords, note });
    this.closeModal();
    this.toast('已新增');
    this.render();
  },

  async delQuote(id) {
    const r = await this.api('DELETE', '/api/quotes/' + encodeURIComponent(id));
    this.toast(r.ok ? '已删除' : (r.msg || '失败'));
    this.render();
  }
});
