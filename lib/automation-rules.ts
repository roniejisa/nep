import {selectedChannels,contentBrief} from './content-rules';
export function automationSettings(value:Record<string,unknown>){
 if(typeof value.enabled!=='boolean')throw new Error('Trạng thái lịch không hợp lệ.');
 const channels=selectedChannels(value.channels);
 if(!['gemini','anthropic','openai'].includes(String(value.provider)))throw new Error('Chọn AI hợp lệ.');
 const model=typeof value.model==='string'?value.model.trim():'';
 if(model&&!/^[A-Za-z0-9._:-]{1,80}$/.test(model))throw new Error('Tên model không hợp lệ.');
 contentBrief(value.copy_length,'problem');
 if(!Number.isInteger(value.daily_limit)||Number(value.daily_limit)<1||Number(value.daily_limit)>24)throw new Error('Giới hạn từ 1 đến 24 lượt/ngày.');
 return {enabled:value.enabled,channels,provider:String(value.provider),model,copy_length:String(value.copy_length),daily_limit:Number(value.daily_limit)};
}
export function pickRandom<T>(values:T[],random:()=>number=Math.random):T{if(!values.length)throw new Error('Không có lựa chọn phù hợp.');return values[Math.min(values.length-1,Math.floor(random()*values.length))];}
