import {selectedChannels,contentBrief} from './content-rules';
export function automationSettings(value:Record<string,unknown>){
 if(typeof value.enabled!=='boolean')throw new Error('Trạng thái lịch không hợp lệ.');
 const channels=selectedChannels(value.channels);
 if(!['gemini','anthropic','openai'].includes(String(value.provider)))throw new Error('Chọn AI hợp lệ.');
 const model=typeof value.model==='string'?value.model.trim():'';
 if(model&&!/^[A-Za-z0-9._:-]{1,80}$/.test(model))throw new Error('Tên model không hợp lệ.');
 contentBrief(value.copy_length,'problem');
 if(!Number.isInteger(value.daily_limit)||Number(value.daily_limit)<1||Number(value.daily_limit)>24)throw new Error('Giới hạn từ 1 đến 24 lượt/ngày.');
 const {morning_start,morning_end,evening_start,evening_end}=postingWindow(value);
 return {morning_start,morning_end,evening_start,evening_end,enabled:value.enabled,channels,provider:String(value.provider),model,copy_length:String(value.copy_length),daily_limit:Number(value.daily_limit)};
}
export function pickRandom<T>(values:T[],random:()=>number=Math.random):T{if(!values.length)throw new Error('Không có lựa chọn phù hợp.');return values[Math.min(values.length-1,Math.floor(random()*values.length))];}

export function postingWindow(value:Record<string,unknown>,now=new Date()){
 const morning_start=Number(value.morning_start??7),morning_end=Number(value.morning_end??12),evening_start=Number(value.evening_start??18),evening_end=Number(value.evening_end??23);
 if(![morning_start,morning_end,evening_start,evening_end].every(Number.isInteger)||morning_start<0||morning_start>=morning_end||morning_end>12||evening_start<12||evening_start>=evening_end||evening_end>24)throw new Error('Giờ sáng phải trong 00–12, giờ tối trong 12–24; giờ kết thúc lớn hơn giờ bắt đầu.');
 const local=new Date(now.getTime()+7*3600000),hour=local.getUTCHours(),period=hour>=morning_start&&hour<morning_end?'morning':hour>=evening_start&&hour<evening_end?'evening':null;
 return {morning_start,morning_end,evening_start,evening_end,period,local_day:local.toISOString().slice(0,10)};
}
