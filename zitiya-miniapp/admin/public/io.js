// 导入/导出（原生 ES 模块，挂到 App）
import { App } from './core.js';

Object.assign(App, {
  // ---------- 导入/导出 ----------
  async renderIO() {
    return `
      <h2 class="section-title">导出</h2>
      <div class="toolbar">
        <button class="btn" data-action="exportLS">下载 LocalStorage 配置</button>
        <button class="btn" data-action="exportCloud">下载云数据库文档</button>
      </div>
      <div class="hint">LocalStorage 配置：在微信开发者工具 → Storage → zuitiya_scene_config 粘贴后刷新即可生效。<br>云数据库文档：在云开发控制台 → 数据库 → scene_config 集合，写入/覆盖 _id=main 的文档。</div>

      <h2 class="section-title" style="margin-top:22px">导入（覆盖当前 patch）</h2>
      <div class="hint">粘贴一个 zuitiya_scene_config 形态的 JSON，将整体覆盖后台当前配置。谨慎操作。</div>
      <textarea class="textarea" id="import_area" placeholder='{"keywordOverrides":{},"customQuotes":[],"intentOverrides":{},"customIntents":[],"crawlTopics":[],"prompts":{},"presets":[],"funnelConfig":{}}'></textarea>
      <div class="toolbar" style="margin-top:10px"><button class="btn" data-action="importPatch">导入并覆盖</button></div>`;
  },

  async importPatch() {
    const txt = document.getElementById('import_area').value.trim();
    if (!txt) { this.toast('请粘贴 JSON'); return; }
    try {
      const obj = JSON.parse(txt);
      await this.api('POST', '/api/import', obj);
      this.toast('导入成功');
      this.render();
    } catch (e) { this.toast('JSON 解析失败'); }
  }
});
