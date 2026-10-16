import {metaRequest,type SocialTarget} from './social-publish.ts';
import {OperationError} from './operation-error.ts';

export async function publishReel(options:{channel:'facebook'|'instagram';body:string;videoUrl:string;target:SocialTarget;onContainer:(id:string)=>Promise<void>;deadline?:number;transport?:typeof fetch;pause?:(ms:number)=>Promise<void>}){
 const {channel,body,videoUrl,target,onContainer}=options;
 if(channel!=='facebook'&&channel!=='instagram')throw new Error('Reel chỉ hỗ trợ Facebook và Instagram.');
 const url=new URL(videoUrl);if(url.protocol!=='https:')throw new Error('Video phải có URL HTTPS đã ký.');
 if(!/^\d+$/.test(target.id)||!/^v\d+\.\d+$/.test(target.version))throw new Error('Đích Reel không hợp lệ.');
 const transport=options.transport??fetch,pause=options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),deadline=options.deadline??Date.now()+260000;
 const remaining=()=>{const time=deadline-Date.now();if(time<1500)throw new OperationError('Hết thời gian xử lý Reel. Kiểm tra Meta; không tự gửi lại.','network');return Math.min(20000,time);};
 const host=channel==='instagram'&&target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
 const get=(path:string)=>metaRequest(`${host}/${path}${target.appSecretProof?'&appsecret_proof='+encodeURIComponent(target.appSecretProof):''}`,target.token,undefined,transport,remaining());
 const post=(path:string,values:Record<string,string>)=>metaRequest(`${host}/${path}`,target.token,target.appSecretProof?{...values,appsecret_proof:target.appSecretProof}:values,transport,remaining());
 if(channel==='instagram'){
  const container=await post(`${target.id}/media`,{media_type:'REELS',video_url:videoUrl,caption:body,share_to_feed:'true'});
  if(!container.id)throw new Error('Instagram chưa trả mã container Reel.');
  await onContainer(String(container.id));
  for(let attempt=0;attempt<80;attempt++){
   const state=await get(`${container.id}?fields=status_code`);
   if(state.status_code==='FINISHED'){
    const result=await post(`${target.id}/media_publish`,{creation_id:String(container.id)});
    if(!result.id)throw new Error('Instagram chưa xác nhận mã Reel đã đăng.');
    return {id:String(result.id),container:String(container.id)};
   }
   if(state.status_code!=='IN_PROGRESS')throw new Error('Instagram không xử lý được video Reel. Kiểm tra codec/âm thanh và trạng thái container.');
   if(attempt<79){remaining();await pause(3000);}
  }
  throw new Error('Instagram chưa xử lý xong Reel. Không tự gửi lại.');
 }
 const session=await post(`${target.id}/video_reels`,{upload_phase:'start'});
 if(!/^\d+$/.test(String(session.video_id)))throw new Error('Facebook chưa trả mã video Reel.');
 const id=String(session.video_id);await onContainer(id);
 // Fixed Meta upload host; never send the Page token to a provider-supplied URL.
 let response:Response;
 try{response=await transport(`https://rupload.facebook.com/video-upload/${target.version}/${id}`,{method:'POST',headers:{Authorization:`OAuth ${target.token}`,file_url:videoUrl},signal:AbortSignal.timeout(remaining()),redirect:'error'});}catch{throw new OperationError('Không xác nhận được bước Facebook nhận video. Không tự gửi lại.','network');}
 let uploaded;try{uploaded=await response.json();}catch{throw new OperationError('Facebook upload trả dữ liệu không hợp lệ.','meta',response.status);}
 if(!response.ok||uploaded.success!==true){const code=Number.isInteger(uploaded.error?.code)?uploaded.error.code:null,kind=code===190||response.status===401?'token':response.status===403?'permission':response.status===429?'rate_limit':'meta';throw new OperationError(`Facebook chưa xác nhận tải video (HTTP ${response.status}, mã ${code??'không có'}).`,kind,response.status,code);}
 const finish=await post(`${target.id}/video_reels`,{upload_phase:'finish',video_id:id,video_state:'PUBLISHED',description:body});
 if(finish.success!==true)throw new Error('Facebook chưa nhận bước hoàn tất Reel. Không tự gửi lại.');
 for(let attempt=0;attempt<80;attempt++){
  const result=await get(`${id}?fields=status`),status=result.status;
  if(status?.publishing_phase?.status==='complete')return {id,container:id};
  if(status?.video_status==='error'||[status?.uploading_phase?.status,status?.processing_phase?.status,status?.publishing_phase?.status].includes('error'))throw new Error('Facebook xử lý hoặc xuất bản Reel thất bại. Kiểm tra video và trạng thái trên Meta.');
  if(attempt<79){remaining();await pause(3000);}
 }
 throw new Error('Facebook chưa xác nhận Reel đã xuất bản. Không tự gửi lại.');
}
