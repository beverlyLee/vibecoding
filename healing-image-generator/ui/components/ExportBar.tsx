import { useApp } from '@ui/store/AppContext';
import { useGeneration } from '@ui/hooks/useGeneration';

export function ExportBar() {
  const { state, dispatch } = useApp();
  const { downloadZip } = useGeneration();

  return (
    <div className="export-bar">
      <div className="export-info">
        <span className="export-title">导出</span>
        <span className="export-note">默认 JPG 0.92 · 可选 PNG · 照片仅在本地处理，不上传</span>
      </div>
      <div className="export-actions">
        <label className="fmt-toggle">
          <span>格式</span>
          <select value={state.exportFmt} onChange={e => dispatch({ type: 'SET_EXPORT_FMT', fmt: e.target.value })}>
            <option value="image/jpeg">JPG</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
        <button className="btn-ghost" disabled={!state.cards?.length} onClick={downloadZip}>
          整套打包 ZIP ⬇
        </button>
      </div>
    </div>
  );
}
