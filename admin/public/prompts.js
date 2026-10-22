// 提示词（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 提示词 ----------
  async renderPrompts() {
    const list = await this.api('GET', '/api/prompts');
    const blocks = list.map(p => `
      <div class="field" style="margin-bottom:16px">
        <label><b>${this.esc(p.key)}</b> ${p.overridden ? '<span class="badge ov">已覆盖</span>' : '<span class="badge def">默认</span>'}</label>
        <textarea class="textarea" id="prompt_${this.esc(p.key)}">${this.esc(p.value)}</textarea>
        <div class="pill-actions" style="margin-top:6px">
          <button class="btn sm" data-action="savePrompt" data-key="${this.esc(p.key)}">保存覆盖</button>
          ${p.overridden ? `<button class="btn gray sm" data-action="resetPrompt" data-key="${this.esc(p.key)}">还原默认</button>` : ''}
        </div>
      </div>`).join('');
    return `
      <div class="notice">提示词是 LLM 的 system / user 模板。覆盖后生效方式同其他配置（导出贴回小程序）。analyze=拆招分析，quoteGen=语录生成system，rewrite=换说法system；quoteGenUser / rephraseUser 为可配置的 user 模板（需小程序侧同步支持）。</div>
      <div class="toolbar"><button class="btn" data-action="addPrompt">＋ 新增提示词键</button></div>
      ${blocks}`;
  },

  async savePrompt(key) {
    const val = document.getElementById('prompt_' + key).value;
    await this.api('PUT', '/api/prompts/' + encodeURIComponent(key), { value: val });
    this.toast('已保存覆盖');
    this.render();
  },
  async resetPrompt(key) {
    await this.api('DELETE', '/api/prompts/' + encodeURIComponent(key));
    this.toast('已还原默认');
    this.render();
  },
  modalPrompt() {
    this.modal(`
      <h3>新增提示词键</h3>
      <div class="field" style="margin-bottom:10px"><label>键名（如 myPrompt）</label><input class="input" id="np_key" placeholder="字母/数字/下划线"></div>
      <div class="field"><label>内容</label><textarea class="textarea" id="np_val"></textarea></div>
      <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="saveNewPrompt">添加</button></div>
    `);
  },
  async saveNewPrompt() {
    const key = document.getElementById('np_key').value.trim();
    const val = document.getElementById('np_val').value;
    if (!key) { this.toast('请填写键名'); return; }
    await this.api('PUT', '/api/prompts/' + encodeURIComponent(key), { value: val });
    this.closeModal();
    this.toast('已添加');
    this.render();
  }
});
