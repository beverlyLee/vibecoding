// 出招场景库（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 出招场景库 ----------
  async renderAttack() {
    const [scenes, cats] = await Promise.all([
      this.api('GET', '/api/attack-scenes'),
      this.api('GET', '/api/attack-categories')
    ]);
    const catChips = cats.map(c =>
      `<span class="chip">${this.esc(c)} ${c === '全部' ? '' : `<span class="x" data-action="delAttackCategory" data-cat="${this.esc(c)}">×</span>`}</span>`
    ).join('');
    const sceneCards = scenes.map(s => {
      const badge = s.origin === 'custom'
        ? `<span class="badge custom">自定义</span>`
        : (s.overridden ? `<span class="badge ov">已覆盖</span>` : `<span class="badge def">默认</span>`);
      const del = s.origin === 'custom'
        ? `<button class="btn danger sm" data-action="delAttackScene" data-id="${this.esc(s.id)}">删除</button>`
        : `<button class="btn gray sm" data-action="delAttackScene" data-id="${this.esc(s.id)}">还原默认</button>`;
      const openPreview = (s.openings || []).slice(0, 2).map(o => `<li class="ell">${this.esc(o)}</li>`).join('');
      return `<div class="scene-card">
        <div class="scene-head">
          <span class="scene-cat">${this.esc(s.category)}</span>
          <span class="scene-title">${this.esc(s.title)}</span> ${badge}
        </div>
        <div class="scene-desc">${this.esc(s.desc) || '<span class="hint">无描述</span>'}</div>
        <div class="scene-meta">开场 ${s.openings.length} 条 · 闭环 ${s.followups.length} 条</div>
        <ul class="scene-open">${openPreview}</ul>
        <div class="pill-actions scene-actions">
          <button class="btn ghost sm" data-action="editAttackScene" data-id="${this.esc(s.id)}">编辑</button>
          ${del}
        </div>
      </div>`;
    }).join('');
    return `
      <div class="notice">出招场景库是「主动出击」整页的内容（开场话术 + 谈话闭环）。默认场景不可删除，只能「编辑」（生成覆盖）或「还原默认」。修改后导出文件贴回小程序即可生效。</div>
      <h2 class="section-title">分类管理 <span class="count">${cats.length} 个</span></h2>
      <div class="chips" style="margin-bottom:10px">${catChips || '<span class="hint">暂无</span>'}</div>
      <div class="kw-input-row">
        <input class="input" id="attack_cat_new" placeholder="新增分类（「全部」为保留项，无需添加）" style="flex:1">
        <button class="btn" data-action="addAttackCategory">添加分类</button>
      </div>
      <div class="toolbar" style="margin-top:16px"><button class="btn" data-action="addAttackScene">＋ 新增场景</button>
        <span class="hint">默认场景来自 src/data/attackScenes.ts，不可删；新增场景为自定义。</span></div>
      <h2 class="section-title" style="margin-top:8px">场景列表 <span class="count">${scenes.length} 个</span></h2>
      <div class="scenes-grid">${sceneCards || '<div class="empty">暂无场景</div>'}</div>`;
  },

  modalAttackScene(id) {
    const self = this;
    Promise.all([
      this.api('GET', '/api/attack-scenes'),
      this.api('GET', '/api/attack-categories')
    ]).then(([scenes, cats]) => {
      const s = id ? scenes.find(x => x.id === id) : null;
      const catOpts = cats.map(c => `<option value="${self.esc(c)}">${self.esc(c)}</option>`).join('');
      const openVal = s ? (s.openings || []).join('\n') : '';
      const fuVal = s ? (s.followups || []).map(f => `${f.trigger} | ${f.reply}`).join('\n') : '';
      self.modal(`
        <h3>${id ? '编辑场景' : '新增出招场景'}</h3>
        ${s ? `<div class="notice">${s.origin === 'default' ? '这是默认场景，保存将生成「覆盖」，可随时还原默认。' : '自定义场景，保存直接修改。'}</div>` : ''}
        <div class="row">
          <div class="field"><label>分类</label>
            <input class="input" id="as_cat" list="as_cat_list" value="${s ? self.esc(s.category) : ''}">
            <datalist id="as_cat_list">${catOpts}</datalist>
          </div>
          <div class="field"><label>id（默认场景不可改）</label><input class="input" id="as_id" value="${s ? self.esc(s.id) : ''}" ${s && s.origin === 'default' ? 'readonly' : ''} placeholder="留空自动生成"></div>
        </div>
        <div class="field" style="margin-bottom:10px"><label>标题</label><input class="input" id="as_title" value="${s ? self.esc(s.title) : ''}"></div>
        <div class="field" style="margin-bottom:10px"><label>描述</label><input class="input" id="as_desc" value="${s ? self.esc(s.desc) : ''}"></div>
        <div class="field" style="margin-bottom:10px"><label>开场话术（每行一条）</label>
          <textarea class="textarea" id="as_openings" style="min-height:90px">${self.esc(openVal)}</textarea></div>
        <div class="field" style="margin-bottom:10px"><label>谈话闭环（每行格式：对方回应 | 我方跟进）</label>
          <textarea class="textarea" id="as_followups" style="min-height:120px">${self.esc(fuVal)}</textarea>
          <span class="hint">用竖线 | 分隔「对方」与「我方」，例如：你这茶可不行 | 酒量我不行，但情分我管够</span></div>
        <div class="actions">
          <button class="btn gray" data-action="closeModal">取消</button>
          <button class="btn" data-action="saveAttackScene" data-id="${s ? self.esc(s.id) : ''}">保存</button>
        </div>`);
    });
  },

  async saveAttackScene() {
    const get = id => document.getElementById(id).value;
    const openings = get('as_openings').split('\n').map(s => s.trim()).filter(Boolean);
    const followups = get('as_followups').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const idx = line.indexOf(' | ');
      if (idx < 0) return { trigger: line, reply: '' };
      return { trigger: line.slice(0, idx).trim(), reply: line.slice(idx + 3).trim() };
    }).filter(f => f.trigger || f.reply);
    const body = {
      id: get('as_id').trim(),
      category: get('as_cat').trim() || '日常边界',
      title: get('as_title').trim(),
      desc: get('as_desc').trim(),
      openings, followups
    };
    const id = document.querySelector('[data-action="saveAttackScene"]').dataset.id;
    if (id) {
      // 默认场景 id 不可变，剔除 id 字段
      const existing = (await this.api('GET', '/api/attack-scenes')).find(x => x.id === id);
      if (existing && existing.origin === 'default') delete body.id;
      await this.api('PUT', '/api/attack-scenes/' + encodeURIComponent(id), body);
    } else {
      if (!body.title) { this.toast('请填写标题'); return; }
      await this.api('POST', '/api/attack-scenes', body);
    }
    this.closeModal();
    this.toast('已保存');
    this.render();
  },

  async delAttackScene(id) {
    const r = await this.api('DELETE', '/api/attack-scenes/' + encodeURIComponent(id));
    this.toast(r.restored ? '已还原默认' : (r.ok ? '已删除' : (r.msg || '失败')));
    this.render();
  },

  async addAttackCategory() {
    const v = document.getElementById('attack_cat_new').value.trim();
    if (!v) return;
    await this.api('POST', '/api/attack-categories', { category: v });
    this.toast('已添加');
    this.render();
  },
  async delAttackCategory(cat) {
    await this.api('DELETE', '/api/attack-categories/' + encodeURIComponent(cat));
    this.toast('已移除');
    this.render();
  }
});
