import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProfile, resolveRuntime, chatEndpoint, imagesEndpoint, migrateLegacySettings, DEFAULT_AI_SETTINGS } from '@engine/providers';

describe('档案表完整性', () => {
  it('id 唯一且包含四家基础供应商', () => {
    const ids = PROVIDERS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['ark', 'hunyuan', 'openai', 'custom']));
  });
  it('baseUrl 合法（custom 允许为空，由用户填写）', () => {
    for (const p of PROVIDERS) {
      if (p.id === 'custom') continue;
      expect(p.baseUrl).toMatch(/^https:\/\/[^/]+/);
      expect(p.baseUrl.endsWith('/')).toBe(false);
    }
  });
  it('无 image 档案不得有 imageModels；有 image 的供应商（custom 除外）需有预设', () => {
    for (const p of PROVIDERS) {
      if (p.image) {
        expect(p.image.protocol).toBeTruthy();
        if (p.id !== 'custom') expect(p.imageModels.length).toBeGreaterThan(0);
      } else {
        expect(p.imageModels).toHaveLength(0);
      }
    }
  });
  it('未知 id 回退 custom', () => {
    expect(getProfile('nope').id).toBe('custom');
  });
});

describe('resolveRuntime', () => {
  const mk = (providerId: string, creds: Record<string, unknown> = {}) =>
    ({ enabled: true, providerId, creds: { [providerId]: creds } }) as never;

  it('ark：needsProxy → /proxy-ark + baseUrl 的 path 部分', () => {
    const rt = resolveRuntime(mk('ark', { apiKey: 'k', model: 'm', imageModel: 'i' }));
    expect(rt.baseUrl).toBe('/proxy-ark/api/v3');
    expect(rt.profile.id).toBe('ark');
  });
  it('hunyuan：直连 baseUrl', () => {
    const rt = resolveRuntime(mk('hunyuan', { apiKey: 'a:b', model: 'hunyuan-lite' }));
    expect(rt.baseUrl).toBe('https://api.hunyuan.cloud.tencent.com/v1');
  });
  it('custom：使用用户 baseUrl', () => {
    const rt = resolveRuntime(mk('custom', { baseUrl: 'https://gw.example.com/v1/' }));
    expect(rt.baseUrl).toBe('https://gw.example.com/v1');
  });
  it('chat endpoint 自动补全后缀', () => {
    expect(chatEndpoint(resolveRuntime(mk('ark')))).toBe('/proxy-ark/api/v3/chat/completions');
  });
  it('images endpoint 按类型拼接', () => {
    const rt = resolveRuntime(mk('openai'));
    expect(imagesEndpoint(rt, 'edits')).toBe('https://api.openai.com/v1/images/edits');
    expect(imagesEndpoint(rt, 'generations')).toBe('https://api.openai.com/v1/images/generations');
  });
});

describe('migrateLegacySettings', () => {
  it('旧结构：方舟域名 → ark，字段迁入 creds', () => {
    const m = migrateLegacySettings({
      enabled: true, endpoint: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'sk-1', model: 'doubao-seed-2-0-lite-260428', imageModel: 'doubao-seedream-4-0-250828',
    });
    expect(m.providerId).toBe('ark');
    expect(m.enabled).toBe(true);
    expect(m.creds.ark?.apiKey).toBe('sk-1');
    expect(m.creds.ark?.model).toBe('doubao-seed-2-0-lite-260428');
  });
  it('旧结构：其他域名 → custom，baseUrl 去掉 chat 后缀', () => {
    const m = migrateLegacySettings({
      enabled: false, endpoint: 'https://gw.example.com/v1/chat/completions',
      apiKey: 'sk-2', model: 'gpt-4o', imageModel: '',
    });
    expect(m.providerId).toBe('custom');
    expect(m.creds.custom?.baseUrl).toBe('https://gw.example.com/v1');
  });
  it('新结构原样保留', () => {
    const s = { enabled: true, providerId: 'hunyuan', creds: { hunyuan: { apiKey: 'a:b', model: 'hunyuan-lite', imageModel: '' } } };
    expect(migrateLegacySettings(s)).toEqual(s);
  });
  it('损坏数据回退默认', () => {
    expect(migrateLegacySettings(null)).toEqual({ ...DEFAULT_AI_SETTINGS, creds: {} });
    expect(migrateLegacySettings('x').providerId).toBe('ark');
  });
});
