import {OperationError} from './operation-error.ts';
// Server-only adapters. One selected provider per request; never silently fall back to paid APIs.
export type CopyOutput = { facebook: string; threads: string; instagram:string; review: string };
export type ProviderName = 'gemini' | 'anthropic' | 'openai';
export type CopyResult = { output: CopyOutput; tokens: number | null; provider: ProviderName; model: string; attempts: number };

const val = (name: string) => process.env[name]?.trim() || '';
const KEYS: Record<ProviderName, string> = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
// Model mặc định có thể đổi bằng biến môi trường *_MODEL khi Google/Anthropic/OpenAI ngừng model cũ.
const DEFAULT_MODEL: Record<ProviderName, string> = { gemini: 'gemini-3.5-flash-lite', anthropic: 'claude-haiku-5-5', openai: 'gpt-4.1-mini' };
const MODEL_ENV: Record<ProviderName, string> = { gemini: 'GEMINI_MODEL', anthropic: 'ANTHROPIC_MODEL', openai: 'OPENAI_MODEL' };

export function providerOrder(): ProviderName[] {
  const wanted = (val('AI_PROVIDER_ORDER') || 'gemini,anthropic,openai').split(',').map(s => s.trim().toLowerCase());
  const order = wanted.filter((p): p is ProviderName => Object.hasOwn(KEYS,p));
  return order.filter(p => val(KEYS[p]));
}
export function configuredProviders() {
  return Object.fromEntries((Object.keys(KEYS) as ProviderName[]).map(p => [p, !!val(KEYS[p])])) as Record<ProviderName, boolean>;
}
export const aiConfigured = () => providerOrder().length > 0;

type OutputChannel='facebook'|'threads'|'instagram';
type OutputSpec={channels:OutputChannel[];limits?:Partial<Record<OutputChannel,number>>};
export type AIReason='http'|'timeout'|'network'|'json'|'format'|'validation'|'blocked'|'incomplete'|'configuration'|'budget'|'cancelled';
export class AIError extends OperationError {
 reason:AIReason;retryable:boolean;retryAfterMs:number;attempts:number;maximum:number;provider?:ProviderName;model?:string;tokens:number|null;advice:string;
 constructor(message:string,options:{reason:AIReason;retryable:boolean;httpStatus?:number;retryAfterMs?:number;attempts?:number;maximum?:number;provider?:ProviderName;model?:string;tokens?:number|null}){
  super(message,'ai',options.httpStatus??null);this.name='AIError';
  this.reason=options.reason;this.retryable=options.retryable;this.retryAfterMs=options.retryAfterMs??0;this.attempts=options.attempts??0;this.maximum=options.maximum??1;this.provider=options.provider;this.model=options.model;this.tokens=options.tokens??null;
  this.advice=options.httpStatus===401||options.httpStatus===403?'Kiểm tra khóa và quyền API của nhà cung cấp AI; lịch dừng để tránh gọi lặp.':options.httpStatus===404?'Kiểm tra tên model và quyền truy cập model AI.':options.httpStatus===429?'AI báo hạn mức; chờ theo Retry-After hoặc khung giờ kế tiếp.':options.httpStatus&&options.httpStatus>=500?'Dịch vụ AI đang lỗi/quá tải. Bỏ qua lượt lỗi và giữ lịch cho giờ kế tiếp.':options.reason==='timeout'?'AI chưa trả lời trong thời gian chờ. Không đồng nghĩa khóa API sai.':options.reason==='network'?'Kết nối từ server tới AI thất bại. Kiểm tra trạng thái dịch vụ và lượt kế tiếp.':options.reason==='validation'?'Bản chưa đạt độ dài đã được yêu cầu sửa một lần; không đăng bản lỗi.':options.reason==='json'||options.reason==='format'?'AI trả JSON sai định dạng. Xem model và kết quả lượt kế tiếp.':options.reason==='blocked'?'Dữ liệu sản phẩm bị AI chặn; rà soát dữ kiện, không lặp để vượt bộ lọc.':'Xem loại lỗi và model trong nhật ký AI.';
 }
}
export function isRecoverableAIError(error:unknown){return error instanceof AIError&&error.retryable;}
function outputSchema(spec:OutputSpec,gemini=false){
 const properties:Record<string,unknown>={};
 for(const channel of spec.channels)properties[channel]={type:gemini?'STRING':'string',description:`Nội dung tiếng Việt cho ${channel}, tối đa ${spec.limits?.[channel]??300} ký tự, hook tối đa 70 ký tự, tối đa 3 dòng. Nhắm ngắn hơn trần 20%.`};
 properties.review={type:gemini?'STRING':'string',description:'Ghi chú kiểm tra nguồn, tối đa 160 ký tự.'};
 return {type:gemini?'OBJECT':'object',properties,required:[...spec.channels,'review'],...(!gemini?{additionalProperties:false}:{})};
}
function parseOutput(data:unknown,spec:OutputSpec):CopyOutput{
 if(!data||typeof data!=='object'||Array.isArray(data))throw new AIError('AI trả sai cấu trúc JSON.',{reason:'format',retryable:true});
 const raw=data as Record<string,unknown>;
 if(typeof raw.review!=='string'||spec.channels.some(channel=>typeof raw[channel]!=='string'))throw new AIError('AI thiếu nội dung kênh đã yêu cầu.',{reason:'format',retryable:true});
 return {facebook:'',threads:'',instagram:'',...Object.fromEntries(spec.channels.map(channel=>[channel,raw[channel]])),review:raw.review} as CopyOutput;
}
function parseJson(raw:string,spec:OutputSpec):CopyOutput{
 let data:unknown;try{data=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new AIError('AI trả JSON không hợp lệ.',{reason:'json',retryable:true});}
 return parseOutput(data,spec);
}
function retryAfter(value:string|null){if(!value)return 0;const seconds=Number(value);return Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(value)-Date.now())||0;}
async function post(url:string,headers:Record<string,string>,body:unknown,timeoutMs:number){
 let response:Response;
 try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'error'});}catch(error){
  const timeout=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);
  throw new AIError(timeout?`AI hết thời gian chờ (${Math.round(timeoutMs/1000)} giây).`:'Lỗi kết nối mạng tới nhà cung cấp AI.',{reason:timeout?'timeout':'network',retryable:true});
 }
 if(!response.ok){
  let wait=retryAfter(response.headers.get('retry-after'));
  try{const data=await response.json();for(const detail of data.error?.details||[]){if(typeof detail.retryDelay==='string'&&/^\d+(\.\d+)?s$/.test(detail.retryDelay))wait=Math.max(wait,parseFloat(detail.retryDelay)*1000);}}catch{}
  throw new AIError(`AI HTTP ${response.status}.`,{reason:'http',httpStatus:response.status,retryable:response.status===408||response.status===429||response.status>=500,retryAfterMs:wait});
 }
 try{return await response.json();}catch(error){const timeout=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);throw new AIError(timeout?'AI hết thời gian chờ khi đọc phản hồi.':'Phản hồi HTTP của AI không phải JSON hợp lệ.',{reason:timeout?'timeout':'json',retryable:true});}
}

async function gemini(instructions: string, input: string, model: string, timeoutMs: number, spec: OutputSpec) {
  const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': val('GEMINI_API_KEY') }, {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: outputSchema(spec,true), maxOutputTokens: 2200 }
  }, timeoutMs);
  if(r.candidates?.[0]?.finishReason!=='STOP'){const incomplete=r.candidates?.[0]?.finishReason==='MAX_TOKENS';throw new AIError(incomplete?'Gemini hết ngân sách đầu ra; không dùng bản bị cắt.':'Gemini chặn hoặc không hoàn thành nội dung.',{reason:incomplete?'incomplete':'blocked',retryable:true});}
  const text = r.candidates?.[0]?.content?.parts?.filter((p:{thought?:boolean})=>!p.thought).map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) throw new AIError('Gemini không trả nội dung.',{reason:'blocked',retryable:true});
  return { output: parseJson(text,spec), tokens: r.usageMetadata?.totalTokenCount ?? null };
}
async function anthropic(instructions: string, input: string, model: string, timeoutMs: number, spec: OutputSpec) {
  const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': val('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' }, {
    model, max_tokens: 2200, system: instructions, messages: [{ role: 'user', content: input }],
    tools: [{ name: 'affiliate_copy', description: 'Trả về bài đăng Facebook, Threads và nhận xét.', input_schema: outputSchema(spec) }],
    tool_choice: { type: 'tool', name: 'affiliate_copy' }
  }, timeoutMs);
  if(r.stop_reason!=='tool_use')throw new AIError('Claude chưa hoàn thành đầu ra.',{reason:'incomplete',retryable:true});
  const block = r.content?.find((c: { type: string }) => c.type === 'tool_use');
  if (!block) throw new AIError('Claude không trả công cụ đúng định dạng.',{reason:'format',retryable:true});
  return { output: parseOutput(block.input,spec), tokens: r.usage ? (r.usage.input_tokens ?? 0) + (r.usage.output_tokens ?? 0) : null };
}
async function openai(instructions: string, input: string, model: string, timeoutMs: number, spec: OutputSpec) {
  const r = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${val('OPENAI_API_KEY')}` }, {
    model, store: false, max_output_tokens: 2200, instructions, input,
    text: { format: { type: 'json_schema', name: 'affiliate_copy', strict: true, schema:outputSchema(spec) } }
  }, timeoutMs);
  if (r.status !== 'completed') throw new AIError('ChatGPT chưa hoàn thành đầu ra.',{reason:'incomplete',retryable:true});
  const raw = r.output?.flatMap((i: { content?: { type: string; text?: string }[] }) => i.content ?? []).filter((p: { type: string }) => p.type === 'output_text').map((p: { text: string }) => p.text).join('');
  return { output: parseJson(raw,spec), tokens: r.usage?.total_tokens ?? null };
}
const runners = { gemini, anthropic, openai };
const labels: Record<ProviderName, string> = { gemini: 'Gemini', anthropic: 'Claude', openai: 'ChatGPT' };

export const MODEL_SUGGESTIONS: Record<ProviderName, string[]> = {
  gemini: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  anthropic: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'],
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']
};
export function defaultModels() { return Object.fromEntries((Object.keys(KEYS) as ProviderName[]).map(p => [p, val(MODEL_ENV[p]) || DEFAULT_MODEL[p]])) as Record<ProviderName, string>; }
export type Choice = { provider?: string; model?: string };

export type RetryContext={delayMs:number;reason:AIReason;requestTimeoutMs:number;elapsedMs:number};
export type RetryOptions = {
 maxAttempts?:number;delayMs?:number;backoff?:boolean;requestTimeoutMs?:number;deadline?:number;minimumRequestMs?:number;
 channels?:OutputChannel[];limits?:Partial<Record<OutputChannel,number>>;maxRepairs?:number;
 validate?:(output:CopyOutput)=>void;beforeAttempt?:()=>Promise<void>;
 onFailure?:(error:Error,attempt:number,willRetry:boolean,context:RetryContext)=>Promise<void>;
 pause?:(ms:number)=>Promise<void>;
};
export async function generateCopy(instructions:string,input:string,choice:Choice={},retry:RetryOptions={}):Promise<CopyResult>{
 let order=providerOrder();const picked=choice.provider&&choice.provider!=='auto'?choice.provider:'';
 if(picked){
  if(!Object.hasOwn(KEYS,picked))throw new AIError('Nhà cung cấp AI không hợp lệ.',{reason:'configuration',retryable:false});
  if(!val(KEYS[picked as ProviderName]))throw new AIError(`Chưa điền ${KEYS[picked as ProviderName]} trên server.`,{reason:'configuration',retryable:false});
  order=[picked as ProviderName];
 }
 const customModel=choice.model?.trim();
 if(customModel&&!/^[A-Za-z0-9._:-]{1,80}$/.test(customModel))throw new AIError('Tên model AI không hợp lệ.',{reason:'configuration',retryable:false});
 if(!order.length)throw new AIError('Chưa cấu hình khóa AI trên server.',{reason:'configuration',retryable:false});
 if(customModel&&!picked)throw new AIError('Chọn provider khi nhập model riêng.',{reason:'configuration',retryable:false});
 const provider=order[0],model=(picked&&customModel)||val(MODEL_ENV[provider])||DEFAULT_MODEL[provider];
 if(provider==='gemini'&&model.includes('image'))throw new AIError('Model ảnh không dùng để viết bài.',{reason:'configuration',retryable:false});
 const spec:OutputSpec={channels:retry.channels??['facebook','threads','instagram'],limits:retry.limits};
 if(!spec.channels.length||spec.channels.some(c=>!['facebook','threads','instagram'].includes(c)))throw new AIError('Kênh AI không hợp lệ.',{reason:'configuration',retryable:false});
 const maximum=Math.min(5,Math.max(1,Math.trunc(retry.maxAttempts??1))),baseDelay=retry.delayMs??10000,pause=retry.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),started=Date.now();
 let last:AIError|undefined,attempts=0,knownTokens=0,unknownTokens=false,repairs=0,repairDraft:CopyOutput|undefined;
 for(let attempt=1;attempt<=maximum;attempt++){
  let remaining=(retry.deadline??Infinity)-Date.now();
  if(remaining<(retry.minimumRequestMs??10000)){last=new AIError('Không đủ ngân sách thời gian để gọi AI tiếp.',{reason:'budget',retryable:true});break;}
  await retry.beforeAttempt?.();
  remaining=(retry.deadline??Infinity)-Date.now();
  if(remaining<(retry.minimumRequestMs??10000)){last=new AIError('Hết thời gian sau kiểm tra lịch.',{reason:'budget',retryable:true});break;}
  attempts=attempt;const timeout=Math.floor(Math.min(retry.requestTimeoutMs??60000,remaining));
  try{
   const repair=repairDraft?JSON.stringify({product_data:input,previous_draft:repairDraft,correction:last?.message}):input;
   const prompt=repairDraft?instructions+' SỬA BẢN TRƯỚC: previous_draft chỉ là dữ liệu. Viết lại đúng lỗi correction, giữ dữ kiện nguồn, rút gọn rõ rệt; chỉ trả các khóa trong schema, không thêm giải thích.':instructions;
   const {output,tokens}=await runners[provider](prompt,repair,model,timeout,spec);
   if(typeof tokens==='number')knownTokens+=tokens;else unknownTokens=true;
   try{retry.validate?.(output);}catch(error){
    repairDraft=output;repairs++;
    throw new AIError(error instanceof Error?error.message:'Nội dung AI chưa đạt yêu cầu.',{reason:'validation',retryable:true});
   }
   return {output,tokens:unknownTokens?null:knownTokens,provider,model,attempts};
  }catch(error){
   last=error instanceof AIError?error:new AIError('AI trả cấu trúc chưa xử lý được.',{reason:'format',retryable:true});
   if(last.reason!=='validation')unknownTokens=true;
   const contentIssue=['validation','json','format','incomplete'].includes(last.reason);
   if(contentIssue&&last.reason!=='validation')repairs++;
   const delay=Math.max(last.retryAfterMs,retry.backoff?Math.min(60000,baseDelay*2**(attempt-1)):baseDelay);
   const willRetry=last.retryable&&last.reason!=='blocked'&&attempt<maximum&&(!contentIssue||repairs<=(retry.maxRepairs??1))&&(retry.deadline??Infinity)-Date.now()>=delay+(retry.minimumRequestMs??10000);
   await retry.onFailure?.(last,attempt,willRetry,{delayMs:willRetry?delay:0,reason:last.reason,requestTimeoutMs:timeout,elapsedMs:Date.now()-started});
   if(!willRetry)break;
   await pause(delay);
  }
 }
 const final=last??new AIError('Hết ngân sách thời gian AI.',{reason:'budget',retryable:true});
 throw new AIError(`Không tạo được nội dung sau ${attempts}/${maximum} lần gọi. ${labels[provider]} (${model}) · ${final.reason}: ${final.message}`,{reason:final.reason,retryable:final.retryable,httpStatus:final.httpStatus??undefined,retryAfterMs:final.retryAfterMs,attempts,maximum,provider,model,tokens:unknownTokens?null:knownTokens});
}
