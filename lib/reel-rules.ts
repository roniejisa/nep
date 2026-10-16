export const VIDEO_BUCKET='affiliate-product-videos';
export const MAX_VIDEO_BYTES=50*1024*1024;
export type PostFormat='feed'|'reel';
export type ProductVideo={id:string;product_id:string;owner_id:string;storage_path:string;original_name:string;size_bytes:number;duration:number;width:number;height:number;approved:boolean;created_at:string;url?:string};
export function postFormat(value:unknown):PostFormat{
 if(value===undefined||value==='feed')return 'feed';
 if(value==='reel')return 'reel';
 throw new Error('Chọn Bài thường hoặc Reel.');
}
export function videoMetadata(value:{size_bytes:number;duration:number;width:number;height:number}){
 if(!Number.isInteger(value.size_bytes)||value.size_bytes<1||value.size_bytes>MAX_VIDEO_BYTES)throw new Error('Video MP4 cần nhỏ hơn hoặc bằng 50 MB.');
 if(!Number.isFinite(value.duration)||value.duration<4||value.duration>60)throw new Error('Video cho mẫu Reel này cần dài 4–60 giây.');
 if(!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<540||value.height<960||Math.abs(value.width/value.height-9/16)>0.015)throw new Error('Dùng video dọc 9:16, tối thiểu 540 × 960.');
}
export function reelSettings(value:Record<string,unknown>){
 const format_mode=value.format_mode??'feed';
 if(format_mode!=='feed'&&format_mode!=='reel'&&format_mode!=='mixed')throw new Error('Chế độ định dạng không hợp lệ.');
 const raw=value.slot_formats??{};
 if(typeof raw!=='object'||raw===null||Array.isArray(raw))throw new Error('Định dạng từng giờ không hợp lệ.');
 const slot_formats:Record<string,PostFormat>={};
 for(const [time,format] of Object.entries(raw)){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Array.isArray(value.schedule_times)||!value.schedule_times.includes(time))throw new Error('Định dạng riêng phải thuộc một giờ đã chọn.');
  slot_formats[time]=postFormat(format);
 }
 return {format_mode:format_mode as 'feed'|'reel'|'mixed',slot_formats};
}
export function slotFormats(cfg:ReturnType<typeof reelSettings>,slot:Date):PostFormat[]{
 const local=new Date(slot.getTime()+7*3600000).toISOString().slice(11,16);
 return cfg.slot_formats[local]?[cfg.slot_formats[local]]:cfg.format_mode==='mixed'?['feed','reel']:[cfg.format_mode];
}
