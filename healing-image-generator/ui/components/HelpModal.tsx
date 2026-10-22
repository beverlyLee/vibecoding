import { useApp } from '@ui/store/AppContext';

export function HelpModal() {
  const { state, dispatch } = useApp();
  const close = () => dispatch({ type: 'SET_UI', ui: { helpOpen: false } });
  return (
    <div className="modal-mask" hidden={!state.ui.helpOpen} onClick={close}>
      <div className="modal modal-help" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>怎么用</h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <div className="help-body">
          <p><b>默认模式</b>：上传 1 张照片，选张数 N，写一段文案 → 自动切成 N 段，每张卡片一段，可逐卡改字。</p>
          <p><b>逐图主体</b>：上传 N 张照片，每张成为一张卡片的主体，风格仍统一。</p>
          <p>选好背景 / 版式 / 比例后点「生成治愈卡片」。随时切换参数会即时重渲。</p>
          <p><b>文字编辑</b>：点击预览图上的文字选中，下方编辑面板可改内容、字体、字重、字号、对齐、行距、字间距、颜色（点色轮自定义颜色与透明度）、描边、背景色；文字可直接在预览图上拖动定位，「＋文字」可加多个文本框。改好样式后可点「应用到全部」同步所有卡片。</p>
          <p>单卡操作：AI 生图 ✨（需在设置中开启并填图像模型）、下载 ⬇；上传替换图后再点「AI 生成相似图」可生成同款主角的新图。</p>
          <p>AI 代写 ✍：开启 AI 后，写文案区出现该按钮，以你输入的文字为线索自动生成文案。</p>
          <p>导出：每张卡片可单独下载，或点「整套打包 ZIP」一次下载。</p>
          <p className="help-priv">🔒 照片只在本地浏览器处理，不会上传。</p>
        </div>
      </div>
    </div>
  );
}
