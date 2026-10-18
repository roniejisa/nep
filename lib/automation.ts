import {readyIssues} from '@/lib/product-readiness';
import {slotFormats} from './reel-rules';
import {assertPublishingQuota} from './publishing-quota';
import {randomInt,timingSafeEqual} from 'node:crypto';
import {database,env} from './content-server';
import {generateContent} from './content-generate';
import {publishContent} from './content-publish';
import {socialTarget} from './social-connections';
import {instagramTarget} from './instagram-connection';
import {automationSettings,pickRandom,postingWindow,productMatches,imageChoices,scheduledDue} from './automation-rules';
import {AIError,isRecoverableAIError,configuredProviders} from './ai-provider';
import {metaRequest,type SocialTarget} from './social-publish';
import {explainError} from './operation-error';
import type {Channel} from './content-rules';
export async function automationTarget(db:ReturnType<typeof database>,owner:string,channel:Channel):Promise<SocialTarget>{return channel==='instagram'?instagramTarget(db,owner):socialTarget(db,owner,channel);}
export function cronAuthorized(header:string|null){const secret=process.env.CRON_SECRET?.trim();if(!secret||secret.length<32)return false;const a=Buffer.from(header||''),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&timingSafeEqual(a,b);}
export async function runAutomation(){
 const started=Date.now(),db=database(),owner=env('CONTENT_ADMIN_USER_ID');
 const {error:cleanupError}=await db.rpc('cleanup_affiliate_automation');if(cleanupError)throw new Error('Chạy automation-controls.sql để bật kiểm soát và dọn lỗi.');
 const {data:schedule,error:scheduleError}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).maybeSingle();if(scheduleError)throw new Error('Không đọc được cấu hình lịch.');
 if(!schedule?.enabled||schedule.schedule_mode!=='times'&&!scheduledDue(schedule))return {status:'skipped',message:'Lịch tắt hoặc chưa đến giờ đã chọn.'};
 const {data:job,error:claimError}=await db.rpc('claim_affiliate_automation',{p_owner:owner});
 if(claimError)throw new Error('Chưa lấy được lượt chạy. Chạy automation.sql trước.');
 if(!job)return {status:'skipped',message:'Chưa có mốc giờ chờ xử lý, lịch đã tắt hoặc một lượt khác đang chạy.'};
 let stage='database',channel:Channel|null=null;
 const finish=async(status:string,message:string)=>{const {error}=await db.from('affiliate_automation_jobs').update({status,message,finished_at:new Date().toISOString()}).eq('id',job);if(error)throw new Error('Không lưu được lịch sử tự động.');return {status,message};};
 try{
  const {data:raw,error}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).single();if(error||!raw)throw new Error('Không đọc được cấu hình lịch.');
  const cfg=automationSettings(raw);if(!cfg.enabled)return finish('skipped','Lịch đã tắt.');
  const {data:interrupted,error:interruptedError}=await db.from('affiliate_automation_jobs').select('id,post_id').eq('owner_id',owner).eq('status','running').neq('id',job);
  if(interruptedError)throw new Error('Không kiểm tra được lượt chạy trước.');
  if(interrupted?.length){
   const ids=interrupted.map(item=>item.post_id).filter(Boolean);
   const result=ids.length?await db.from('affiliate_content_posts').select('id,status').eq('owner_id',owner).in('id',ids):{data:[],error:null};
   if(result.error)throw new Error('Không đọc được trạng thái bài của lượt bị ngắt.');
   let uncertain=false;
   for(const previous of interrupted){
    const post=result.data?.find(item=>item.id===previous.post_id),safe=!previous.post_id||post?.status==='draft'||post?.status==='published';
    if(!safe)uncertain=true;
    const {error:closeError}=await db.from('affiliate_automation_jobs').update({status:post?.status==='published'?'done':'failed',message:safe?'Lượt trước bị ngắt; lịch sử xác nhận chưa gửi hoặc đã lưu kết quả. Không gửi lại bài cũ.':'Lượt trước có bài đang gửi/chưa rõ kết quả. Kiểm tra Meta; không tự gửi lại.',finished_at:new Date().toISOString()}).eq('id',previous.id);
    if(closeError)throw new Error('Không ghi nhận được lượt bị ngắt.');
   }
   if(uncertain)throw new Error('Có bài của lượt trước đang gửi/chưa rõ kết quả. Kiểm tra Meta trước khi bật lại.');
  }
  stage='ai';
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
   const {error:logError}=await db.from('affiliate_automation_errors').insert({owner_id:owner,job_id:job,channel,...detail,message:`AI lần ${attempt}/5 · ${cfg.model||cfg.provider} · ${context.reason}: ${detail.message}${wait}`});
   if(logError)throw new Error('Không lưu được nhật ký thử lại AI.');
   const {error:progressError}=await db.from('affiliate_automation_jobs').update({message:`AI lần ${attempt}/5: ${detail.message}${wait}`}).eq('id',job);
   if(progressError)throw new Error('Không lưu được tiến độ thử lại AI.');
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
  const detail=explainError(error,stage);
  const {error:logError}=await db.from('affiliate_automation_errors').insert({owner_id:owner,job_id:job,channel,...detail});
  if(stage==='ai'&&isRecoverableAIError(error))return finish('skipped',`Lỗi AI tạm thời hoặc nội dung chưa đạt; chưa gửi Meta. Lịch vẫn bật, chờ khung giờ kế tiếp.${logError?' Không lưu được chi tiết lỗi.':''}`);
  const {error:pauseError}=await db.from('affiliate_automation_settings').update({enabled:false,updated_at:new Date().toISOString()}).eq('owner_id',owner);
  return finish('failed',`${pauseError?'Không xác nhận được tắt lịch.':'Lịch đã tạm dừng.'} ${logError?'Không lưu được chi tiết lỗi; kiểm tra kết nối cơ sở dữ liệu.':'Xem Nhật ký lỗi trong 8 giờ để biết nguyên nhân và cách xử lý.'}`);
 }
}
