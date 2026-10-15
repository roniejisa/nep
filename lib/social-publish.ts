import type {Channel} from './content-rules';
export type SocialTarget={id:string;token:string;version:string;instagramLogin?:'facebook'|'instagram'};
export async function metaRequest(url:string,token:string,values?:Record<string,string>,transport:typeof fetch=fetch){
 const response=await transport(url,{method:values?'POST':'GET',headers:{Authorization:`Bearer ${token}`},body:values?new URLSearchParams(values):undefined,signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
 let data;try{data=await response.json();}catch{throw new Error(`Meta trả phản hồi không hợp lệ (HTTP ${response.status}).`);}
 if(!response.ok||data.error)throw new Error(`Meta từ chối (HTTP ${response.status}, mã ${data.error?.code??'không có'}, mã phụ ${data.error?.error_subcode??'không có'}). Kiểm tra quyền, token và tài khoản đích.`);
 return data;
}
export async function publishSocial(options:{channel:Channel;body:string;imageUrl?:string;target:SocialTarget;onContainer:(id:string)=>Promise<void>;transport?:typeof fetch;pause?:(ms:number)=>Promise<void>}){
 const {channel,body,imageUrl,target,onContainer}=options;const transport=options.transport??fetch;const pause=options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 if(channel==='instagram'&&!imageUrl)throw new Error('Instagram cần ảnh.');
 const host=channel==='threads'?'https://graph.threads.net/v1.0':channel==='instagram'&&target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
 const send=async(path:string,values:Record<string,string>)=>{const r=await metaRequest(`${host}/${path}`,target.token,values,transport);if(!r.id)throw new Error('Meta chưa trả mã nội dung.');return String(r.id);};
 if(channel==='facebook'){
  const id=imageUrl?await send(`${target.id}/photos`,{url:imageUrl,caption:body,published:'true'}):await send(`${target.id}/feed`,{message:body});return {id};
 }
 const container=channel==='instagram'?await send(`${target.id}/media`,{image_url:imageUrl!,caption:body}):await send(`${target.id}/threads`,imageUrl?{media_type:'IMAGE',image_url:imageUrl,text:body}:{media_type:'TEXT',text:body});
 await onContainer(container);
 let ready=false;
 for(let attempt=0;attempt<10;attempt++){
  const field=channel==='instagram'?'status_code':'status';const state=await metaRequest(`${host}/${container}?fields=${field}`,target.token,undefined,transport);const status=state[field];
  if(status==='FINISHED'){ready=true;break;}
  if(status==='ERROR'||status==='EXPIRED')throw new Error(`Container ${channel} lỗi hoặc hết hạn. Kiểm tra ảnh/định dạng và quyền.`);
  if(status!=='IN_PROGRESS')throw new Error('Meta trả trạng thái container chưa xác định.');
  if(attempt<9)await pause(2000);
 }
 if(!ready)throw new Error('Meta chưa xử lý xong ảnh trong thời gian chờ. Cần kiểm tra container, không gửi lại tự động.');
 const id=await send(`${target.id}/${channel==='instagram'?'media_publish':'threads_publish'}`,{creation_id:container});return {id,container};
}
