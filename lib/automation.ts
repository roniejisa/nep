import {readyIssues} from '@/lib/product-readiness';
import {automationFailureSummary,automationFailureContext} from '@/lib/automation-outcome';
import {slotFormats} from './reel-rules';
import {assertPublishingQuota} from './publishing-quota';
import {randomInt,timingSafeEqual} from 'node:crypto';
import {database,env} from './content-server';
import {generateContent} from './content-generate';
import {publishContent} from './content-publish';
import {socialTarget} from './social-connections';
import {instagramTarget} from './instagram-connection';
import {automationSettings,pickRandom,postingWindow,productMatches,imageChoices,scheduledDue} from './automation-rules';
import {AIError,configuredProviders} from './ai-provider';
import {metaRequest,type SocialTarget} from './social-publish';
import {explainError} from './operation-error';
import type {Channel} from './content-rules';
export async function automationTarget(db:ReturnType<typeof database>,owner:string,channel:Channel):Promise<SocialTarget>{return channel==='instagram'?instagramTarget(db,owner):socialTarget(db,owner,channel);}
export function cronAuthorized(header:string|null){const secret=process.env.CRON_SECRET?.trim();if(!secret||secret.length<32)return false;const a=Buffer.from(header||''),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&timingSafeEqual(a,b);}
export async function runAutomation(){
 const started=Date.now(),db=database(),owner=env('CONTENT_ADMIN_USER_ID');
 let job:string|null=null,stage='database',channel:Channel|null=null;
 const telemetry=(event:string,detail?:ReturnType<typeof explainError>)=>console.error(event,{job_id:job,stage:detail?.stage||stage,kind:detail?.kind||'database',http_status:detail?.http_status??null,error_code:detail?.error_code??null,error_subcode:detail?.error_subcode??null});
 const recordError=async(detail:ReturnType<typeof explainError>,jobId=job,errorChannel=channel)=>{try{const {error}=await db.from('affiliate_automation_errors').insert({owner_id:owner,job_id:jobId,channel:errorChannel,...detail}).abortSignal(AbortSignal.timeout(5000));if(error){telemetry('automation.error_log_unavailable',detail);return false;}return true;}catch{telemetry('automation.error_log_unavailable',detail);return false;}};
 const finish=async(status:string,message:string)=>{
  if(!job)return {status,message};
  try{const {error}=await db.from('affiliate_automation_jobs').update({status,message,finished_at:new Date().toISOString()}).eq('id',job).eq('owner_id',owner).abortSignal(AbortSignal.timeout(5000));if(error)throw error;return {status,message,historySaved:true};}
  catch{telemetry('automation.job_finish_unavailable');await recordError(explainError(new Error('Không lưu được trạng thái lượt chạy; không tự gửi lại bài đã gửi.'),'database'));return {status,message:message+' Chưa lưu được trạng thái lượt chạy; hệ thống sẽ đối chiếu lượt bị ngắt, không tự gửi lại bài cũ.',historySaved:false};}
 };
 try{
  try{const {error}=await db.rpc('cleanup_affiliate_automation');if(error)await recordError(explainError(new Error('Chưa dọn được nhật ký hết hạn; vẫn tiếp tục lượt chạy.'),'database'));}catch{await recordError(explainError(new Error('Dọn nhật ký bị gián đoạn; vẫn tiếp tục lượt chạy.'),'database'));}
  const {data:schedule,error:scheduleError}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).maybeSingle();if(scheduleError)throw new Error('Không đọc được cấu hình lịch.');
  if(!schedule?.enabled||schedule.schedule_mode!=='times'&&!scheduledDue(schedule))return {status:'skipped',message:'Lịch tắt hoặc chưa đến giờ đã chọn.'};
  const {data:claimed,error:claimError}=await db.rpc('claim_affiliate_automation',{p_owner:owner});
  if(claimError)throw new Error('Chưa lấy được lượt chạy. Kiểm tra các migration lịch đăng.');
  if(!claimed)return {status:'skipped',message:'Chưa có mốc giờ chờ xử lý, lịch đã tắt hoặc một lượt khác đang chạy.'};
  job=claimed;
  const {data:raw,error}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).single();if(error||!raw)throw new Error('Không đọc được cấu hình lịch.');
  stage='configuration';
  const cfg=automationSettings(raw);if(!cfg.enabled)return finish('skipped','Lịch đã tắt.');
  stage='database';
  const {data:interrupted,error:interruptedError}=await db.from('affiliate_automation_jobs').select('id,post_id,channel').eq('owner_id',owner).eq('status','running').neq('id',job);
  if(interruptedError)throw new Error('Không kiểm tra được lượt chạy trước.');
  if(interrupted?.length){
   const ids=interrupted.map(item=>item.post_id).filter(Boolean);
   const result=ids.length?await db.from('affiliate_content_posts').select('id,status').eq('owner_id',owner).in('id',ids):{data:[],error:null};
   if(result.error)throw new Error('Không đọc được trạng thái bài của lượt bị ngắt.');
   for(const previous of interrupted){
    const post=result.data?.find(item=>item.id===previous.post_id),safe=!previous.post_id||post?.status==='draft'||post?.status==='published';
    if(post?.status==='publishing'){
     const {error:quarantineError}=await db.from('affiliate_content_posts').update({status:'unknown'}).eq('id',post.id).eq('owner_id',owner).eq('status','publishing');
     if(quarantineError)throw new Error('Chưa đánh dấu được bài đang gửi để đối chiếu; bỏ qua lượt này, không gửi lại.');
    }
    const message=safe?'Lượt trước bị ngắt; không gửi lại bài cũ. Lịch tiếp tục ở các mốc sau.':'Lượt trước có bài chưa rõ kết quả. Giữ bài ở Cần xác minh, không gửi lại; lịch tiếp tục với bài mới.';
    const {error:closeError}=await db.from('affiliate_automation_jobs').update({status:post?.status==='published'?'done':'skipped',message,finished_at:new Date().toISOString()}).eq('id',previous.id).eq('owner_id',owner);
    if(closeError)throw new Error('Không ghi nhận được lượt bị ngắt.');
    if(!safe)await recordError(explainError(new Error('Lượt bị ngắt có bài chưa rõ kết quả. Đã cách ly bài cũ; chỉ xử lý bài mới ở lượt tiếp theo.'),'recovery'),previous.id,previous.channel||null);
   }
  }
  stage='configuration';
  if(!configuredProviders()[cfg.provider as keyof ReturnType<typeof configuredProviders>])throw new Error('Chưa cấu hình khóa AI đã chọn.');
  stage='database';
  const {data:products,error:productsError}=await db.from('affiliate_products').select('id,name,description,affiliate_url,category').eq('owner_id',owner).eq('status','ready').not('verified_at','is',null).order('id').limit(1001);
  if(productsError)throw new Error('Không đọc được sản phẩm.');if((products?.length||0)>1000)throw new Error('Lịch hiện hỗ trợ tối đa 1.000 sản phẩm sẵn sàng.');
  const {data:eligible,error:eligibleError}=await db.rpc('eligible_affiliate_products',{p_owner:owner});if(eligibleError)throw new Error('Không đọc được giới hạn đăng của sản phẩm.');
  const valid=(products||[]).filter(p=>eligible?.includes(p.id)&&productMatches(p,cfg)&&!readyIssues(p).length);
  const {data:images,error:imageError}=await db.from('affiliate_product_images').select('id,product_id').eq('owner_id',owner).limit(12001);if(imageError||((images?.length||0)>12000))throw new Error('Không đọc đủ danh sách ảnh.');
  let formats:('feed'|'reel')[]=['feed'];
  if(cfg.format_mode!=='feed'||Object.keys(cfg.slot_formats||{}).length){
   const {data:jobRow,error:slotError}=await db.from('affiliate_automation_jobs').select('slot').eq('id',job).eq('owner_id',owner).single();
   if(slotError||!jobRow?.slot)throw new Error('Không đọc được mốc giờ đã nhận.');
   formats=slotFormats(cfg,new Date(jobRow.slot));
  }
  let videos:{id:string;product_id:string}[]=[];
  if(formats.includes('reel')){
   const {data,error}=await db.from('affiliate_product_videos').select('id,product_id').eq('owner_id',owner).eq('approved',true).limit(10001);
   if(error||(data?.length||0)>10000)throw new Error('Chưa đọc đủ kho video. Kiểm tra reels.sql.');videos=data||[];
  }
  const options=formats.flatMap(format=>cfg.channels.flatMap(channel=>valid.filter(p=>format==='reel'?channel!=='threads'&&videos.some(v=>v.product_id===p.id):channel!=='instagram'||cfg.max_images>0&&images?.some(i=>i.product_id===p.id)).map(product=>({channel,product,format}))));
  const {data:previous,error:previousError}=await db.from('affiliate_automation_jobs').select('product_id').eq('owner_id',owner).eq('status','done').order('created_at',{ascending:false}).limit(1);if(previousError)throw new Error('Không đọc được lịch sử sản phẩm.');
  if(!options.length){
   const message=!(products?.length)?'Chưa có sản phẩm Sẵn sàng và đã kiểm tra nguồn.':!valid.length?'Không có sản phẩm khớp nguồn đã chọn với đủ tên, mô tả và link HTTPS. Nếu dữ liệu đã đủ, kiểm tra đã chạy automation-unrestricted.sql chưa.':formats.every(f=>f==='reel')?'Chưa có video đã xác nhận của sản phẩm trong nguồn, hoặc chưa bật Facebook/Instagram. Lượt chỉ Reel không tự đổi sang bài thường.':'Không có ảnh/video phù hợp cho kênh và định dạng đã chọn. Kiểm tra kho media của sản phẩm.';
   return finish('skipped',message);
  }
  const alternatives=options.filter(o=>o.product.id!==previous?.[0]?.product_id);
  const random=()=>randomInt(0,1000000)/1000000;
  const selected=pickRandom(alternatives.length?alternatives:options,random);
  channel=selected.channel;stage='connection';
  const target=await automationTarget(db,owner,selected.channel);
  if(raw.targets?.[selected.channel]!==target.id)throw new Error('Đích đăng đã thay đổi. Lưu lại lịch để xác nhận tài khoản mới.');
  stage='token_check';
  const host=channel==='threads'?'https://graph.threads.net/v1.0':channel==='instagram'&&target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
  await metaRequest(`${host}/${target.id}?fields=id${target.appSecretProof?'&appsecret_proof='+encodeURIComponent(target.appSecretProof):''}`,target.token);
  await assertPublishingQuota(selected.channel,target);
  stage='database';
  const {error:selectError}=await db.from('affiliate_automation_jobs').update({channel:selected.channel,product_id:selected.product.id,message:`AI ${cfg.provider} · ${cfg.model||'model mặc định server'} · ${cfg.copy_length==='tiny'?'Siêu ngắn':'Ngắn'} · timeout tối đa 60 giây.`}).eq('id',job);if(selectError)throw new Error('Không lưu được sản phẩm đã chọn.');
  // Requests have a 300s budget; only release AI locks older than 10 min.
  const {error:staleError}=await db.from('affiliate_content_runs').update({status:'failed'}).eq('owner_id',owner).eq('status','running').lt('created_at',new Date(Date.now()-600000).toISOString());if(staleError)throw new Error('Không kiểm tra được lượt AI cũ.');
  const ownedVideo=selected.format==='reel'?pickRandom(videos.filter(v=>v.product_id===selected.product.id),random):null;
  const ownedImages=selected.format==='reel'?[]:imageChoices((images||[]).filter(i=>i.product_id===selected.product.id),cfg.max_images,random);
  stage='ai';
  const result=await generateContent(db,owner,{productId:selected.product.id,channels:[selected.channel],provider:cfg.provider,model:cfg.model,length:cfg.copy_length,angle:'problem',imageIds:ownedImages.map(i=>i.id),postFormat:selected.format,videoId:ownedVideo?.id},{maxAttempts:5,delayMs:10000,backoff:true,maxRepairs:1,requestTimeoutMs:60000,deadline:started+(selected.format==='reel'?180000:215000),beforeAttempt:async()=>{
   const {data:current,error}=await db.from('affiliate_automation_settings').select('enabled,updated_at').eq('owner_id',owner).single();
   if(error)throw new Error('Không kiểm tra được lịch trước khi gọi AI.');
   if(!current?.enabled||current.updated_at!==raw.updated_at)throw new AIError('Lịch đã tắt hoặc cấu hình đã đổi. Dừng gọi AI.',{reason:'cancelled',retryable:true});
  },onFailure:async(error,attempt,willRetry,context)=>{
   const detail=explainError(error,'ai'),wait=willRetry?` · Thử lại sau khoảng ${Math.ceil(context.delayMs/1000)} giây.`:' · Dừng thử trong lượt này.';
   await recordError({...detail,message:`AI lần ${attempt}/5 · ${cfg.model||cfg.provider} · ${context.reason}: ${detail.message}${wait}`});
   try{const {error:progressError}=await db.from('affiliate_automation_jobs').update({message:`AI lần ${attempt}/5 · ${automationFailureContext(detail,channel)}${wait}`}).eq('id',job).eq('owner_id',owner).abortSignal(AbortSignal.timeout(5000));if(progressError)telemetry('automation.ai_retry_progress_unavailable',detail);}catch{telemetry('automation.ai_retry_progress_unavailable',detail);}

  }});
  stage='database';
  const post=result.posts?.[0];if(!post)throw new Error('Chưa có bài hợp lệ.');
  const {error:postError}=await db.from('affiliate_automation_jobs').update({post_id:post.id}).eq('id',job);if(postError)throw new Error('Không lưu được liên kết bài.');
  const {data:latest,error:latestError}=await db.from('affiliate_automation_settings').select('enabled,updated_at').eq('owner_id',owner).single();
  if(latestError||!latest?.enabled||latest.updated_at!==raw.updated_at)return finish('skipped','Cấu hình đã đổi hoặc tắt. Giữ bài ở bản nháp.');
  if(Date.now()-started>(selected.format==='reel'?210000:265000))return finish('skipped','Không đủ thời gian gửi Meta. Đã giữ bản nháp; lịch vẫn bật cho khung giờ kế tiếp.');
  stage='publish';
  const published=await publishContent(db,owner,{postId:post.id,body:post.body,imageIds:post.image_ids,action:'publish',approved:true,deadline:started+285000,expectedTargetId:raw.targets[selected.channel]});
  return finish('done',`Đã tạo và đăng 1 ${selected.format==='reel'?'Reel':'bài thường'} · ${result.attempts??1} lần gọi AI.${published?.warning?' '+published.warning:''}`);
 }catch(error){
  if(stage==='ai'&&error instanceof AIError&&error.reason==='cancelled')return finish('skipped','Đã dừng gọi AI vì lịch tắt hoặc cấu hình đổi.');
  const detail=explainError(error,stage),recorded=await recordError(detail);
  return finish('skipped',automationFailureSummary(detail,channel,recorded));
 }
}
