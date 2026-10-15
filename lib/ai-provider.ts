// Server only. Thử lần lượt các nhà cung cấp AI đã có khóa: mặc định Gemini (miễn phí) -> Claude -> ChatGPT.
export type CopyOutput = { facebook: string; threads: string; review: string };
export type ProviderName = 'gemini' | 'anthropic' | 'openai';
export type CopyResult = { output: CopyOutput; tokens: number | null; provider: ProviderName; model: string };

const val = (name: string) => process.env[name]?.trim() || '';
const KEYS: Record<ProviderName, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
// Model mặc định có thể đổi bằng biến môi trường *_MODEL khi Google/Anthropic/OpenAI ngừng model cũ.
const DEFAULT_MODEL: Record<ProviderName, string> = { gemini: 'gemini-3.1-flash-lite', anthropic: 'claude-haiku-5-5', openai: 'gpt-4.1-mini' };
const MODEL_ENV: Record<ProviderName, string> = { gemini: 'GEMINI_MODEL', anthropic: 'ANTHROPIC_MODEL', openai: 'OPENAI_MODEL' };

export function providerOrder(): ProviderName[] {
  const wanted = (val('AI_PROVIDER_ORDER') || 'gemini,anthropic,openai').split(',').map(s => s.trim().toLowerCase());
  const order = wanted.filter((p): p is ProviderName => p in KEYS);
  return order.filter(p => val(KEYS[p]));
}
export function configuredProviders() {
  return Object.fromEntries((Object.keys(KEYS) as ProviderName[]).map(p => [p, !!val(KEYS[p])])) as Record<ProviderName, boolean>;
}
export const aiConfigured = () => providerOrder().length > 0;

const schema = { type: 'object', properties: { facebook: { type: 'string' }, threads: { type: 'string' }, review: { type: 'string' } }, required: ['facebook', 'threads', 'review'], additionalProperties: false };
const geminiSchema = { type: 'OBJECT', properties: { facebook: { type: 'STRING' }, threads: { type: 'STRING' }, review: { type: 'STRING' } }, required: ['facebook', 'threads', 'review'] };

class ProviderError extends Error { constructor(message: string, public retryable: boolean) { super(message); } }
const parseJson = (raw: string): CopyOutput => {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(clean);
  if (typeof data.facebook !== 'string' || typeof data.threads !== 'string' || typeof data.review !== 'string') throw new ProviderError('AI trả nội dung sai định dạng.', true);
  return data;
};
async function post(url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  // Không chuyển tiếp nội dung lỗi của nhà cung cấp: có thể chứa khóa hoặc URL.
  if (!response.ok) throw new ProviderError(`HTTP ${response.status}`, response.status === 429 || response.status >= 500 || response.status === 404 || response.status === 403);
  return response.json();
}

async function gemini(instructions: string, input: string, model: string) {
  const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': val('GEMINI_API_KEY') }, {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema, maxOutputTokens: 4096 }
  });
  const text = r.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new ProviderError('Gemini không trả nội dung (có thể bị bộ lọc an toàn chặn).', true);
  return { output: parseJson(text), tokens: r.usageMetadata?.totalTokenCount ?? null };
}
async function anthropic(instructions: string, input: string, model: string) {
  const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': val('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' }, {
    model, max_tokens: 2200, system: instructions, messages: [{ role: 'user', content: input }],
    tools: [{ name: 'affiliate_copy', description: 'Trả về bài đăng Facebook, Threads và nhận xét.', input_schema: schema }],
    tool_choice: { type: 'tool', name: 'affiliate_copy' }
  });
  const block = r.content?.find((c: { type: string }) => c.type === 'tool_use');
  if (!block) throw new ProviderError('Claude không trả nội dung đúng định dạng.', true);
  const out = block.input;
  if (typeof out?.facebook !== 'string' || typeof out?.threads !== 'string' || typeof out?.review !== 'string') throw new ProviderError('AI trả nội dung sai định dạng.', true);
  return { output: out as CopyOutput, tokens: r.usage ? (r.usage.input_tokens ?? 0) + (r.usage.output_tokens ?? 0) : null };
}
async function openai(instructions: string, input: string, model: string) {
  const r = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${val('OPENAI_API_KEY')}` }, {
    model, store: false, max_output_tokens: 2200, instructions, input,
    text: { format: { type: 'json_schema', name: 'affiliate_copy', strict: true, schema } }
  });
  if (r.status !== 'completed') throw new ProviderError('ChatGPT chưa hoàn thành trong hạn mức.', true);
  const raw = r.output?.flatMap((i: { content?: { type: string; text?: string }[] }) => i.content ?? []).filter((p: { type: string }) => p.type === 'output_text').map((p: { text: string }) => p.text).join('');
  return { output: parseJson(raw), tokens: r.usage?.total_tokens ?? null };
}
const runners = { gemini, anthropic, openai };
const labels: Record<ProviderName, string> = { gemini: 'Gemini', anthropic: 'Claude', openai: 'ChatGPT' };

export const MODEL_SUGGESTIONS: Record<ProviderName, string[]> = {
  gemini: ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']
};
export function defaultModels() { return Object.fromEntries((Object.keys(KEYS) as ProviderName[]).map(p => [p, val(MODEL_ENV[p]) || DEFAULT_MODEL[p]])) as Record<ProviderName, string>; }
export type Choice = { provider?: string; model?: string };

export async function generateCopy(instructions: string, input: string, choice: Choice = {}): Promise<CopyResult> {
  let order = providerOrder();
  const picked = choice.provider && choice.provider !== 'auto' ? choice.provider : '';
  if (picked) {
    if (!(picked in KEYS)) throw new Error('AI đã chọn không hợp lệ.');
    if (!val(KEYS[picked as ProviderName])) throw new Error(`Chưa điền ${KEYS[picked as ProviderName]} trên Vercel nên chưa dùng được ${labels[picked as ProviderName]}.`);
    order = [picked as ProviderName]; // đã chọn cụ thể thì không tự chuyển sang AI khác
  }
  const customModel = choice.model?.trim();
  if (customModel && !/^[A-Za-z0-9._:-]{1,80}$/.test(customModel)) throw new Error('Tên model không hợp lệ.');
  if (!order.length) throw new Error('Chưa có khóa AI nào. Điền GEMINI_API_KEY (miễn phí) hoặc ANTHROPIC_API_KEY / OPENAI_API_KEY trên Vercel.');
  const failures: string[] = [];
  for (const provider of order) {
    const model = (picked && customModel) || val(MODEL_ENV[provider]) || DEFAULT_MODEL[provider];
    try {
      const { output, tokens } = await runners[provider](instructions, input, model);
      return { output, tokens, provider, model };
    } catch (error) {
      const retryable = error instanceof ProviderError ? error.retryable : true; // lỗi mạng/timeout/JSON hỏng -> thử bên tiếp theo
      failures.push(`${labels[provider]}: ${error instanceof Error ? error.message : 'lỗi'}`);
      if (!retryable) break;
    }
  }
  throw new Error(`Không tạo được nội dung. ${failures.join(' · ')}. Kiểm tra khóa API, tên model và hạn mức.`);
}
