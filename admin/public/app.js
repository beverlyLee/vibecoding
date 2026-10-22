// 嘴替鸭后台管理 SPA —— 入口引导（原生 ES 模块，无构建）
// 先加载核心 App 外壳，再加载各功能模块（它们会把自己的方法挂到 App 上），最后启动。
// 注意：ES 模块作用域不是全局，index.html 里的 onclick="App.refreshAll()" 需要 App 可见，
// 因此把 App 挂到 window（仅为此兼容，不改变任何业务逻辑）。
import './core.js';
import './intents.js';
import './quotes.js';
import './topics.js';
import './attack.js';
import './presets.js';
import './prompts.js';
import './funnel.js';
import './runtime.js';
import './io.js';
import { App } from './core.js';

window.App = App;
App.init();
