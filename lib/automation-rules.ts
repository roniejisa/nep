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
 const schedule_mode=value.schedule_mode==='times'?'times':'windows';if(value.schedule_mode&& !['times','windows'].includes(String(value.schedule_mode)))throw new Error('Chế độ lịch không hợp lệ.');
 const schedule_times=schedule_mode==='times'?scheduleTimes(value.schedule_times):[];
 return {schedule_mode,schedule_times,...selectionSettings(value),morning_start,morning_end,evening_start,evening_end,enabled:value.enabled,channels,provider:String(value.provider),model,copy_length:String(value.copy_length),daily_limit:Number(value.daily_limit)};
}
export function pickRandom<T>(values:T[],random:()=>number=Math.random):T{if(!values.length)throw new Error('Không có lựa chọn phù hợp.');return values[Math.min(values.length-1,Math.floor(random()*values.length))];}

export function postingWindow(value:Record<string,unknown>,now=new Date()){
 const morning_start=Number(value.morning_start??7),morning_end=Number(value.morning_end??12),evening_start=Number(value.evening_start??18),evening_end=Number(value.evening_end??23);
 if(![morning_start,morning_end,evening_start,evening_end].every(v=>Number.isFinite(v)&&Math.abs(v*60-Math.round(v*60))<0.01)||morning_start<0||morning_start>=morning_end||morning_end>12||evening_start<12||evening_start>=evening_end||evening_end>24)throw new Error('Giờ sáng phải trong 00–12, giờ tối trong 12–24; giờ kết thúc lớn hơn giờ bắt đầu.');
 const local=new Date(now.getTime()+7*3600000),minute=local.getUTCHours()*60+local.getUTCMinutes(),period=minute>=Math.round(morning_start*60)&&minute<Math.round(morning_end*60)?'morning':minute>=Math.round(evening_start*60)&&minute<Math.round(evening_end*60)?'evening':null;
 return {morning_start,morning_end,evening_start,evening_end,period,local_day:local.toISOString().slice(0,10)};
}

export function selectionSettings(value:Record<string,unknown>){
 const selection_mode=String(value.selection_mode??'random');if(!['random','products','categories'].includes(selection_mode))throw new Error('Cách chọn sản phẩm không hợp lệ.');
 const strings=(input:unknown,max:number)=>{if(input===undefined)return [] as string[];if(!Array.isArray(input)||input.length>max||input.some(v=>typeof v!=='string'||!v.trim()||v.length>80))throw new Error('Danh sách lựa chọn không hợp lệ.');return [...new Set(input as string[])];};
 const selected_products=strings(value.selected_products,1000),selected_categories=strings(value.selected_categories,200);
 if(selected_products.some(v=>! /^[0-9a-f-]{36}$/i.test(v)))throw new Error('ID sản phẩm không hợp lệ.');
 if(selection_mode==='products'&&!selected_products.length||selection_mode==='categories'&&!selected_categories.length)throw new Error('Chọn ít nhất một sản phẩm hoặc danh mục cho chế độ này.');
 const max_images=Number(value.max_images??1);if(!Number.isInteger(max_images)||max_images<0||max_images>10)throw new Error('Chọn từ 0 đến 10 ảnh tối đa.');
 return {selection_mode,selected_products,selected_categories,max_images};
}
export function productMatches(p:{id:string;category?:string},cfg:ReturnType<typeof selectionSettings>){return cfg.selection_mode==='random'||cfg.selection_mode==='products'&&cfg.selected_products.includes(p.id)||cfg.selection_mode==='categories'&&cfg.selected_categories.includes(p.category||'');}
export function imageChoices<T>(images:T[],maximum:number,random:()=>number=Math.random):T[]{const remaining=[...images],chosen:T[]=[];while(remaining.length&&chosen.length<maximum){const i=Math.floor(random()*remaining.length);chosen.push(remaining.splice(i,1)[0]);}return chosen;}

export const schedulePresets:Record<string,string[]>={
 '6':['07:00','10:00','13:00','16:00','19:00','22:00'],
 '8':['07:00','09:00','11:00','14:00','17:00','19:00','21:00','23:00'],
 '10':['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','21:30','23:00']
};
export function scheduleTimes(input:unknown):string[]{
 if(!Array.isArray(input)||input.length<1||input.length>24||input.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||new Set(input).size!==input.length)throw new Error('Chọn 1–24 giờ hợp lệ, không trùng nhau.');
 const sorted=[...input].sort() as string[],minutes=sorted.map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
 if(minutes.some((v,i)=>i>0&&v-minutes[i-1]<15)||minutes.length>1&&1440-minutes.at(-1)!+minutes[0]<15)throw new Error('Hai giờ đăng cần cách nhau ít nhất 15 phút, kể cả qua nửa đêm.');
 return sorted;
}
export function legacyTimes(value:Record<string,unknown>):string[]{
 const w=postingWindow(value),times:string[]=[];
 for(const [start,end] of [[w.morning_start,w.morning_end],[w.evening_start,w.evening_end]])for(let m=Math.round(start*60);m<Math.round(end*60);m+=60)times.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);
 return times;
}
export function scheduledDue(value:Record<string,unknown>,now=new Date()){
 if(value.schedule_mode!=='times')return postingWindow(value,now).period!==null;
 const local=new Date(now.getTime()+7*3600000),minute=local.getUTCHours()*60+local.getUTCMinutes();
 return scheduleTimes(value.schedule_times).some(t=>{const m=Number(t.slice(0,2))*60+Number(t.slice(3));return minute>=m&&minute<m+5;});
}
