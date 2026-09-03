import { useState } from 'react';
import { useApp } from '@ui/store/AppContext';
import { testChat, testImage } from '@engine/aiBridge';
import { PROVIDERS, getProfile, resolveRuntime, emptyCreds } from '@engine/providers';
import type { ProviderCreds } from '@engine/providers';

interface TestState { busy: boolean; msg: string }
const TEST_IDLE: TestState = { busy: false, msg: '' };

export function SettingsDrawer() {
  const { state, dispatch } = useApp();
  const { ui, aiSettings } = state;
  const profile = getProfile(aiSettings.providerId);
  const creds = aiSettings.creds[profile.id] ?? emptyCreds();
  const close = () => dispatch({ type: 'SET_UI', ui: { settingsOpen: false } });

  const patch = (p: Partial<typeof aiSettings>) => dispatch({ type: 'SET_AI_SETTINGS', settings: { ...aiSettings, ...p } });
  const patchCreds = (p: Partial<ProviderCreds>) =>
    patch({ creds: { ...aiSettings.creds, [profile.id]: { ...creds, ...p } } });

  /* 切供应商：保留各自已填凭据；新条目自动填该家第一个预设模型 */
  const switchProvider = (id: string) => {
    if (id === aiSettings.providerId) return;
    const target = getProfile(id);
    const existing = aiSettings.creds[id];
    patch({
      providerId: id,
      creds: {
        ...aiSettings.creds,
        [id]: existing ?? {
          ...emptyCreds(),
          model: target.chatModels[0] ?? '',
          imageModel: target.imageModels[0] ?? '',
        },
      },
    });
    setChatTest(TEST_IDLE);
    setImgTest(TEST_IDLE);
  };

  const [chatTest, setChatTest] = useState<TestState>(TEST_IDLE);
  const [imgTest, setImgTest] = useState<TestState>(TEST_IDLE);

  const runChatTest = async () => {
    setChatTest({ busy: true, msg: '' });
    const r = await testChat(resolveRuntime(aiSettings));
    setChatTest({ busy: false, msg: (r.ok ? '✅ ' : '❌ ') + r.msg });
  };
  const runImgTest = async () => {
    setImgTest({ busy: true, msg: '' });
    const r = await testImage(resolveRuntime(aiSettings));
    setImgTest({ busy: false, msg: (r.ok ? '✅ ' : '❌ ') + r.msg });
  };

  return (
    <>
      <div className="drawer-mask" hidden={!ui.settingsOpen} onClick={close} />
      <aside className="drawer" hidden={!ui.settingsOpen} aria-label="设置">
        <div className="drawer-head">
          <h3>设置</h3>
          <button className="icon-btn" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="setting-row">
            <div>
              <p className="setting-name">AI 助手</p>
              <p className="setting-desc">开启后可使用「AI 代写文案」「AI 生成相似图」。生成治愈卡片本身不调用模型。</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={aiSettings.enabled} onChange={e => patch({ enabled: e.target.checked })} />
              <span className="switch-slider" />
            </label>
          </div>
          <div className={'setting-fields' + (aiSettings.enabled ? ' is-on' : '')}>
            <div className="field">
              <span>供应商</span>
              <div className="chip-row">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    className={'chip' + (p.id === aiSettings.providerId ? ' is-active' : '')}
                    onClick={() => switchProvider(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            {profile.id === 'custom' && (
              <label className="field">
                <span>Base URL</span>
                <input
                  type="text" value={creds.baseUrl ?? ''}
                  placeholder="https://your-gateway/v1 （OpenAI 兼容网关）"
                  onChange={e => patchCreds({ baseUrl: e.target.value })}
                />
              </label>
            )}
            <label className="field">
              <span>API Key</span>
              <input type="password" value={creds.apiKey} placeholder="sk-..." autoComplete="off" onChange={e => patchCreds({ apiKey: e.target.value })} />
            </label>
            <label className="field">
              <span>模型（文案 / 情绪线索）</span>
              <input type="text" value={creds.model} list={`chat-models-${profile.id}`} placeholder="如 doubao-seed-2-0-lite / hunyuan-turbos / gpt-4o" onChange={e => patchCreds({ model: e.target.value })} />
              <datalist id={`chat-models-${profile.id}`}>
                {profile.chatModels.map(m => <option key={m} value={m} />)}
              </datalist>
            </label>
            <div className="test-row">
              <button className="btn-ghost btn-mini" disabled={chatTest.busy} onClick={runChatTest}>
                {chatTest.busy ? '测试中…' : '测试文案模型'}
              </button>
              {chatTest.msg && <span className={'test-msg ' + (chatTest.msg.startsWith('✅') ? 'ok' : 'err')}>{chatTest.msg}</span>}
            </div>
            {profile.image && (
              <>
                <label className="field">
                  <span>图像模型（AI 生图用）</span>
                  <input type="text" value={creds.imageModel} list={`image-models-${profile.id}`} placeholder="如 doubao-seedream-4-0-250828 / gpt-image-1" onChange={e => patchCreds({ imageModel: e.target.value })} />
                  <datalist id={`image-models-${profile.id}`}>
                    {profile.imageModels.map(m => <option key={m} value={m} />)}
                  </datalist>
                </label>
                <div className="test-row">
                  <button className="btn-ghost btn-mini" disabled={imgTest.busy} onClick={runImgTest}>
                    {imgTest.busy ? '测试中…' : '测试图像模型'}
                  </button>
                  {imgTest.msg && <span className={'test-msg ' + (imgTest.msg.startsWith('✅') ? 'ok' : 'err')}>{imgTest.msg}</span>}
                </div>
              </>
            )}
          </div>
          {profile.note && <p className="privacy-note sub">{profile.name}：{profile.note}</p>}
          <p className="privacy-note">
            🔒 隐私说明：照片默认只在你浏览器本地处理，<b>不上传</b>任何服务器。仅当你使用 AI 功能并填入自己的
            凭据后，才会把「图片+文案」发往<b>你配置的</b>供应商。关闭 AI 则为纯离线。
          </p>
          <p className="privacy-note sub">AI 调用失败或超时将自动回退，不会中断出图。各供应商凭据独立保存，切换不丢失。</p>
        </div>
      </aside>
    </>
  );
}
