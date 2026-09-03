/* engine/aiBridge.ts · 可选 AI 调用：发往用户自配供应商（档案表统一接入）。
 * 生成治愈卡片不调用模型；模型仅用于 AI 代写文案与 AI 生成相似图。失败/超时回退 null。 */
import { config } from './config';
import { logger } from './logger';
import {
  chatEndpoint, imagesEndpoint,
  type AiRuntime,
} from './providers';

/* dataURL → Blob（images/edits 的 multipart file 部件用） */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/png';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* 把 fetch 异常翻译成可读的失败原因 */
function errText(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return '请求超时（endpoint 无响应）';
  if (e instanceof TypeError) return '网络失败或被 CORS 拦截：浏览器直连被拒。请换用支持跨域的网关地址，或确认 dev 代理生效';
  return e instanceof Error ? e.message : String(e);
}

interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[];
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

export interface AiTestResult { ok: boolean; msg: string }

function chatHeaders(rt: AiRuntime, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${rt.apiKey}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/** 测试文案模型：发送一条最小 chat 请求，透出成功回复或真实失败原因 */
export async function testChat(rt: AiRuntime): Promise<AiTestResult> {
  if (!rt.apiKey || !rt.model)
    return { ok: false, msg: '请先填写 API Key / 模型' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const body = {
      model: rt.model,
      messages: [{ role: 'user', content: '连接测试，请只回复两个字母：OK' }],
      max_tokens: 16,
    };
    logger.ai('chat 测试请求', { endpoint: chatEndpoint(rt), ...logger.runtime(rt), body });
    const resp = await fetch(chatEndpoint(rt), {
      method: 'POST',
      headers: chatHeaders(rt),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = (await resp.text()).slice(0, 160);
      logger.log('ai', { tag: 'chat 测试失败', status: resp.status, body: text }, 'warn');
      return { ok: false, msg: `HTTP ${resp.status}：${text || resp.statusText}` };
    }
    const data = (await resp.json()) as ChatResponse;
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
    return reply
      ? { ok: true, msg: `连通成功，模型回复：「${reply.slice(0, 30)}」` }
      : { ok: false, msg: '接口可达，但响应中没有回复内容' };
  } catch (e) {
    return { ok: false, msg: errText(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 测试图像模型：发一条最小的 images/generations 请求，透出真实失败原因 */
export async function testImage(rt: AiRuntime): Promise<AiTestResult> {
  if (!rt.profile.image) return { ok: false, msg: `该供应商（${rt.profile.name}）不支持生图` };
  if (!rt.apiKey || !rt.imageModel)
    return { ok: false, msg: '请先填写 API Key / 图像模型' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000); // 生图较慢
  const testPrompt = 'a soft cream-pink gradient, healing minimal illustration style';
  try {
    logger.ai('image 测试请求', {
      endpoint: imagesEndpoint(rt, 'generations'), ...logger.runtime(rt),
      prompt: testPrompt, size: rt.profile.image.size,
    });
    const resp = await fetch(imagesEndpoint(rt, 'generations'), {
      method: 'POST',
      headers: chatHeaders(rt),
      body: JSON.stringify({
        model: rt.imageModel,
        prompt: testPrompt,
        size: rt.profile.image.size,
        response_format: 'b64_json', // Ark / dall-e 支持；gpt-image-1 恒返回 b64，此字段忽略
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 160);
      logger.log('ai', { tag: 'image 测试失败', model: rt.imageModel, status: resp.status, body }, 'warn');
      // 高频错误：文本模型被填进了图像模型（方舟提示 only supported by certain models）
      if (/only supported by certain models|not a valid.*image|does not support image/i.test(body))
        return { ok: false, msg: `「${rt.imageModel}」不支持生图，请改用该供应商的图像模型（方舟用 Seedream 系列，如 doubao-seedream-4-0-250828）` };
      return { ok: false, msg: `HTTP ${resp.status}：${body || resp.statusText}` };
    }
    const data = (await resp.json()) as ImagesResponse;
    const item = data.data?.[0];
    if (item?.b64_json || item?.url) return { ok: true, msg: `图像模型 ${rt.imageModel} 可用，已生成测试图` };
    return { ok: false, msg: '接口可达，但响应中没有图像数据' };
  } catch (e) {
    return { ok: false, msg: errText(e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * AI 代写文案（chat completions）：以输入框已有文字作为情绪线索生成治愈系文案，
 * 返回纯文本；参数缺失/失败/超时返回 null。
 */
export async function writeCopy(seed: string, rt: AiRuntime): Promise<string | null> {
  if (!rt.apiKey || !rt.model) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  const messages = [
    { role: 'system', content: config.ai.copySystem },
    seed.trim()
      ? { role: 'user', content: config.ai.copyUser.replace('{seed}', seed.trim()) }
      : { role: 'user', content: config.ai.copyDefault },
  ];
  logger.ai('AI 代写文案请求', { endpoint: chatEndpoint(rt), ...logger.runtime(rt), messages });
  try {
    const resp = await fetch(chatEndpoint(rt), {
      method: 'POST',
      headers: chatHeaders(rt),
      body: JSON.stringify({ model: rt.model, messages }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 200);
      logger.log('ai', { tag: 'AI 代写失败', status: resp.status, body }, 'warn');
      return null;
    }
    const data = (await resp.json()) as ChatResponse;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) logger.log('ai', { tag: 'AI 代写完成', chars: text.length, text });
    return text || null;
  } catch (e) {
    logger.log('ai', { tag: 'AI 代写异常', err: e instanceof Error ? e.message : String(e) }, 'error');
    return null; // 失败回退，调用方 toast 提示
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 卡片级 AI 生图：把卡片文案与当前图发往图像模型，返回生成图 dataURL。
 * 协议由供应商档案的 image.protocol 决定：
 * - ark-json：JSON /images/generations，参考图放 image 字段（Base64 dataURL）
 * - openai-multipart：FormData /images/edits，404/405 时降级纯文生图 generations
 * 参数缺失/失败/超时返回 null。
 */
export async function generateImage(
  text: string, imageDataUrl: string | null, rt: AiRuntime, ratio = '2:3',
): Promise<string | null> {
  const ip = rt.profile.image;
  if (!ip || !rt.apiKey || !rt.imageModel) return null;
  // prompt 内写死的「2:3」随用户所选比例替换，保证 AI 出图与卡片版式一致
  const prompt = config.ai.imagePrompt.replace('{text}', text || '').replace(/2:3/g, ratio);
  logger.ai('AI 生图请求', {
    endpoint: imagesEndpoint(rt, ip.protocol === 'ark-json' ? 'generations' : 'edits'),
    ...logger.runtime(rt), protocol: ip.protocol, size: ip.size,
    prompt, hasReference: Boolean(imageDataUrl && ip.supportsReference),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000); // 生图较慢，给足超时
  try {
    let resp: Response;
    if (ip.protocol === 'ark-json') {
      const body: Record<string, unknown> = { model: rt.imageModel, prompt, size: ip.size, ...ip.extra };
      if (imageDataUrl && ip.supportsReference) body.image = imageDataUrl;
      resp = await fetch(imagesEndpoint(rt, 'generations'), {
        method: 'POST',
        headers: chatHeaders(rt),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } else {
      const form = new FormData();
      form.append('model', rt.imageModel);
      form.append('prompt', prompt);
      form.append('n', '1');
      form.append('size', ip.size);
      if (imageDataUrl && ip.supportsReference) form.append('image', dataUrlToBlob(imageDataUrl), 'input.png');
      resp = await fetch(imagesEndpoint(rt, 'edits'), {
        method: 'POST',
        headers: chatHeaders(rt, false),
        body: form,
        signal: controller.signal,
      });
      if (resp.status === 404 || resp.status === 405) {
        // 网关不支持 multipart /images/edits：降级为 JSON /images/generations 纯文生图（无参考图）
        const soloPrompt = config.ai.imagePromptSolo.replace('{text}', text || '').replace(/2:3/g, ratio);
        logger.log('ai', { tag: '生图降级', from: '/images/edits', to: '/images/generations', prompt: soloPrompt }, 'warn');
        resp = await fetch(imagesEndpoint(rt, 'generations'), {
          method: 'POST',
          headers: chatHeaders(rt),
          body: JSON.stringify({
            model: rt.imageModel,
            prompt: soloPrompt,
            size: ip.size,
            n: 1,
          }),
          signal: controller.signal,
        });
      }
    }
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 200);
      logger.log('ai', { tag: 'AI 生图失败', model: rt.imageModel, status: resp.status, body }, 'warn');
      return null;
    }
    const data = (await resp.json()) as ImagesResponse;
    const item = data.data?.[0];
    if (item?.b64_json) {
      logger.log('ai', { tag: 'AI 生图完成', model: rt.imageModel, b64Chars: item.b64_json.length });
      return 'data:image/png;base64,' + item.b64_json;
    }
    if (item?.url) {
      // URL 响应：转成 dataURL 以便 canvas 无 CORS 顾虑地使用
      logger.log('ai', { tag: 'AI 生图完成（URL 响应）', model: rt.imageModel, url: item.url });
      const r = await fetch(item.url);
      const blob = await r.blob();
      return await new Promise<string | null>((res) => {
        const fr = new FileReader();
        fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
        fr.onerror = () => res(null);
        fr.readAsDataURL(blob);
      });
    }
    return null;
  } catch (e) {
    logger.log('ai', { tag: 'AI 生图异常', err: e instanceof Error ? e.message : String(e) }, 'error');
    return null; // 失败回退，调用方 toast 提示
  } finally {
    clearTimeout(timer);
  }
}
