import {OperationError} from './operation-error.ts';
import type {Channel} from './content-rules';
export type SocialTarget={id:string;token:string;version:string;instagramLogin?:'facebook'|'instagram';appSecretProof?:string};
export async function metaRequest(url:string,token:string,values?:Record<string,string>,transport:typeof fetch=fetch,timeoutMs=15000){
 let response:Response;try{response=await transport(url,{method:values?'POST':'GET',headers:{Authorization:`Bearer ${token}`},body:values?new URLSearchParams(values):undefined,signal:AbortSignal.timeout(timeoutMs),redirect:'error',cache:'no-store'});}catch{throw new OperationError('Không kết nối được Meta hoặc hết thời gian chờ.','network');}
 let data;try{data=await response.json();}catch{throw new OperationError(`Meta trả phản hồi không hợp lệ (HTTP ${response.status}).`,'meta',response.status);}
 if(!response.ok||data.error){const code=Number.isInteger(data.error?.code)?data.error.code:null,subcode=Number.isInteger(data.error?.error_subcode)?data.error.error_subcode:null;const kind=code===190||code===102?'token':code===10||code===200||response.status===403?'permission':response.status===429||[4,17,32,613].includes(code)?'rate_limit':'meta';throw new OperationError(`Meta từ chối (HTTP ${response.status}, mã ${code??'không có'}, mã phụ ${subcode??'không có'}). ${kind==='token'?'Token hết hạn, bị thu hồi hoặc không hợp lệ.':'Kiểm tra quyền, dữ liệu và tài khoản đích.'}`,kind,response.status,code,subcode);}
 return data;
}
export async function publishSocial(options:{channel:Channel;body:string;imageUrl?:string;imageUrls?:string[];target:SocialTarget;onContainer:(id:string)=>Promise<void>;transport?:typeof fetch;pause?:(ms:number)=>Promise<void>;deadline?:number}){
 const {channel,body,target,onContainer}=options,urls=options.imageUrls??(options.imageUrl?[options.imageUrl]:[]);
 if(urls.length>10||new Set(urls).size!==urls.length)throw new Error('Bài đăng tối đa 10 ảnh không trùng.');
 if(channel==='instagram'&&!urls.length)throw new Error('Instagram cần ảnh.');
 const transport=options.transport??fetch,pause=options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),deadline=options.deadline??Date.now()+110000;
 const remaining=()=>{const time=deadline-Date.now();if(time<1500)throw new OperationError('Hết ngân sách thời gian xử lý ảnh. Kiểm tra Meta trước khi thử lại.','network');return Math.min(15000,time);};
 const host=channel==='threads'?'https://graph.threads.net/v1.0':channel==='instagram'&&target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
 const send=async(path:string,values:Record<string,string>)=>{const r=await metaRequest(`${host}/${path}`,target.token,target.appSecretProof?{...values,appsecret_proof:target.appSecretProof}:values,transport,remaining());if(!r.id)throw new Error('Meta chưa trả mã nội dung.');return String(r.id);};
 const wait=async(id:string)=>{
  for(let attempt=0;attempt<10;attempt++){
   const field=channel==='instagram'?'status_code':'status';const state=await metaRequest(`${host}/${id}?fields=${field}`,target.token,undefined,transport,remaining());
   if(state[field]==='FINISHED')return;
   if(state[field]==='ERROR'||state[field]==='EXPIRED')throw new Error(`Container ${channel} lỗi hoặc hết hạn. Kiểm tra ảnh/định dạng và quyền.`);
   if(state[field]!=='IN_PROGRESS')throw new Error('Meta trả trạng thái container chưa xác định.');
   if(attempt<9){remaining();await pause(2000);}
  }
  throw new Error('Meta chưa xử lý xong ảnh trong thời gian chờ. Kiểm tra container, không tự gửi lại.');
 };
 if(channel==='facebook'){
  if(urls.length<2){const id=urls.length?await send(`${target.id}/photos`,{url:urls[0],caption:body,published:'true'}):await send(`${target.id}/feed`,{message:body});return {id};}
  const ids:string[]=[];
  for(const url of urls){const id=await send(`${target.id}/photos`,{url,published:'false'});await onContainer(id);ids.push(id);}
  const id=await send(`${target.id}/feed`,{message:body,attached_media:JSON.stringify(ids.map(media_fbid=>({media_fbid})))});return {id};
 }
 let container:string;
 if(urls.length>1){
  const children:string[]=[];
  for(const image_url of urls){const id=await send(`${target.id}/${channel==='instagram'?'media':'threads'}`,channel==='instagram'?{image_url,is_carousel_item:'true'}:{media_type:'IMAGE',image_url,is_carousel_item:'true'});await onContainer(id);await wait(id);children.push(id);}
  container=await send(`${target.id}/${channel==='instagram'?'media':'threads'}`,{media_type:'CAROUSEL',children:children.join(','),[channel==='instagram'?'caption':'text']:body});
 }else container=channel==='instagram'?await send(`${target.id}/media`,{image_url:urls[0],caption:body}):await send(`${target.id}/threads`,urls.length?{media_type:'IMAGE',image_url:urls[0],text:body}:{media_type:'TEXT',text:body});
 await onContainer(container);await wait(container);
 const id=await send(`${target.id}/${channel==='instagram'?'media_publish':'threads_publish'}`,{creation_id:container});return {id,container};
}
