// 模型厂商（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 模型厂商 ----------
  async renderPresets() {
    const list = await this.api('GET', '/api/presets');
    const rows = list.map(p => {
      const del = `<button class="btn danger sm" data-action="delPreset" data-key="${this.esc(p.key)}">${p.origin === 'default' ? '还原' : '删除'}</button>`;
      return `<tr>
        <td>${this.esc(p.name)}</td>
        <td>${this.esc(p.protocol)}</td>
        <td class="mono">${this.esc(p.baseURL)}</td>
        <td class="mono">${this.esc(p.model)}</td>
        <td class="mono">${this.esc(p.asrModel || '—')}</td>
        <td class="pill-actions">
          <button class="btn ghost sm" data-action="editPreset" data-key="${this.esc(p.key)}">编辑</button>${del}
        </td>
      </tr>`;
    }).join('');
    return `
      <div class="notice">厂商预设是「公开配置」（不含 API Key，Key 仍保留在用户手机本地）。新增/覆盖后，导出文件贴回小程序即可在设置页看到新厂商。协议支持 openai / anthropic。</div>
      <div class="toolbar"><button class="btn" data-action="addPreset">＋ 新增厂商</button></div>
      <table><thead><tr><th>名称</th><th>协议</th><th>Base URL</th><th>模型</th><th>语音模型</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">暂无数据</td></tr>'}</tbody></table>`;
  },

  modalPreset(key) {
    const self = this;
    if (!key) {
      this.modal(`
        <h3>新增厂商预设</h3>
        <div class="row">
          <div class="field"><label>名称</label><input class="input" id="p_name" placeholder="如：我的中转站"></div>
          <div class="field"><label>key（可选）</label><input class="input" id="p_key" placeholder="如：my_gateway"></div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>协议</label>
          <select class="input" id="p_protocol"><option value="openai">openai</option><option value="anthropic">anthropic</option></select></div>
        <div class="field" style="margin-bottom:10px"><label>Base URL</label><input class="input" id="p_base" placeholder="https://.../v1"></div>
        <div class="row">
          <div class="field"><label>模型名</label><input class="input" id="p_model" placeholder="如 deepseek-chat"></div>
          <div class="field"><label>语音模型</label><input class="input" id="p_asr" placeholder="如 whisper-1（可选）"></div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>获取 Key 地址</label><input class="input" id="p_keyurl" placeholder="可选"></div>
        <div class="field"><label>备注</label><input class="input" id="p_note" placeholder="可选"></div>
        <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="savePreset">保存</button></div>
      `);
      return;
    }
    this.api('GET', '/api/presets').then(list => {
      const p = list.find(x => x.key === key);
      self.modal(`
        <h3>编辑厂商：${self.esc(p.name)}</h3>
        <div class="row">
          <div class="field"><label>名称</label><input class="input" id="p_name" value="${self.esc(p.name)}"></div>
          <div class="field"><label>协议</label>
            <select class="input" id="p_protocol">${['openai','anthropic'].map(v=>`<option value="${v}" ${v===p.protocol?'selected':''}>${v}</option>`).join('')}</select>
          </div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>Base URL</label><input class="input" id="p_base" value="${self.esc(p.baseURL)}"></div>
        <div class="row">
          <div class="field"><label>模型名</label><input class="input" id="p_model" value="${self.esc(p.model)}"></div>
          <div class="field"><label>语音模型</label><input class="input" id="p_asr" value="${self.esc(p.asrModel || '')}"></div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>获取 Key 地址</label><input class="input" id="p_keyurl" value="${self.esc(p.keyUrl || '')}"></div>
        <div class="field"><label>备注</label><input class="input" id="p_note" value="${self.esc(p.note || '')}"></div>
        <div class="actions"><button class="btn gray" data-action="closeModal">取消</button><button class="btn" data-action="savePreset" data-key="${self.esc(key)}">保存</button></div>
      `);
    });
  },

  async savePreset() {
    const get = id => document.getElementById(id).value.trim();
    const body = {
      name: get('p_name'), protocol: get('p_protocol'), baseURL: get('p_base'),
      model: get('p_model'), asrModel: get('p_asr'), keyUrl: get('p_keyurl'), note: get('p_note')
    };
    const key = document.querySelector('[data-action="savePreset"]').dataset.key;
    if (key) await this.api('PUT', '/api/presets/' + encodeURIComponent(key), body);
    else await this.api('POST', '/api/presets', { key: get('p_key'), ...body });
    this.closeModal();
    this.toast('已保存');
    this.render();
  },

  async delPreset(key) {
    const r = await this.api('DELETE', '/api/presets/' + encodeURIComponent(key));
    this.toast(r.restored ? '已还原默认' : (r.ok ? '已删除' : (r.msg || '失败')));
    this.render();
  }
});
