import {randomInt,timingSafeEqual} from 'node:crypto';
import {database,env} from './content-server';
import {generateContent} from './content-generate';
import {publishContent} from './content-publish';
import {socialTarget} from './social-connections';
import {instagramTarget} from './instagram-connection';
import {automationSettings,pickRandom,postingWindow,productMatches,imageChoices} from './automation-rules';
import {configuredProviders} from './ai-provider';
import {metaRequest,type SocialTarget} from './social-publish';
import {explainError} from './operation-error';
import type {Channel} from './content-rules';
export async function automationTarget(db:ReturnType<typeof database>,owner:string,channel:Channel):Promise<SocialTarget>{return channel==='instagram'?instagramTarget(db,owner):socialTarget(db,owner,channel);}
export function cronAuthorized(header:string|null){const secret=process.env.CRON_SECRET?.trim();if(!secret||secret.length<32)return false;const a=Buffer.from(header||''),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&timingSafeEqual(a,b);}
export async function runAutomation(){
 const started=Date.now(),db=database(),owner=env('CONTENT_ADMIN_USER_ID');
 const {error:cleanupError}=await db.rpc('cleanup_affiliate_automation');if(cleanupError)throw new Error('Chạy automation-controls.sql để bật kiểm soát và dọn lỗi.');
 const {data:schedule,error:scheduleError}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).maybeSingle();if(scheduleError)throw new Error('Không đọc được cấu hình lịch.');
 if(!schedule?.enabled||!postingWindow(schedule).period)return {status:'skipped',message:'Lịch tắt hoặc ngoài khung giờ sáng/tối.'};
 const {data:job,error:claimError}=await db.rpc('claim_affiliate_automation',{p_owner:owner});
 if(claimError)throw new Error('Chưa lấy được lượt chạy. Chạy automation.sql trước.');
 if(!job)return {status:'skipped',message:'Lịch tắt, đã chạy giờ này, đang chạy hoặc đã đạt hạn mức.'};
 let stage='database',channel:Channel|null=null;
 const finish=async(status:string,message:string)=>{const {error}=await db.from('affiliate_automation_jobs').update({status,message,finished_at:new Date().toISOString()}).eq('id',job);if(error)throw new Error('Không lưu được lịch sử tự động.');return {status,message};};
 try{
  const {data:raw,error}=await db.from('affiliate_automation_settings').select('*').eq('owner_id',owner).single();if(error||!raw)throw new Error('Không đọc được cấu hình lịch.');
  const cfg=automationSettings(raw);if(!cfg.enabled)return finish('skipped','Lịch đã tắt.');
  const {data:interrupted,error:interruptedError}=await db.from('affiliate_automation_jobs').select('id').eq('owner_id',owner).eq('status','running').neq('id',job);
  if(interruptedError)throw new Error('Không kiểm tra được lượt chạy trước.');
  if(interrupted?.length){const {error:closeError}=await db.from('affiliate_automation_jobs').update({status:'failed',message:'Lượt chạy bị ngắt. Kiểm tra bài trên Meta; không tự gửi lại.',finished_at:new Date().toISOString()}).in('id',interrupted.map(j=>j.id));if(closeError)throw new Error('Không ghi nhận được lượt bị ngắt.');throw new Error('Có lượt chạy trước bị ngắt. Kiểm tra lịch sử nội dung và Meta trước khi bật lại.');}
  stage='ai';
  if(!configuredProviders()[cfg.provider as keyof ReturnType<typeof configuredProviders>])throw new Error('Chưa cấu hình khóa AI đã chọn.');
  stage='database';
  const {data:products,error:productsError}=await db.from('affiliate_products').select('id,name,description,affiliate_url,category').eq('owner_id',owner).eq('status','ready').not('verified_at','is',null).order('id').limit(1001);
  if(productsError)throw new Error('Không đọc được sản phẩm.');if((products?.length||0)>1000)throw new Error('Lịch hiện hỗ trợ tối đa 1.000 sản phẩm sẵn sàng.');
  const {data:eligible,error:eligibleError}=await db.rpc('eligible_affiliate_products',{p_owner:owner});if(eligibleError)throw new Error('Không đọc được giới hạn đăng của sản phẩm.');
  const valid=(products||[]).filter(p=>eligible?.includes(p.id)&&productMatches(p,cfg)&&p.name?.trim()&&p.description?.trim()&&/^https:\/\//.test(p.affiliate_url));
  const {data:images,error:imageError}=await db.from('affiliate_product_images').select('id,product_id').eq('owner_id',owner).limit(12001);if(imageError||((images?.length||0)>12000))throw new Error('Không đọc đủ danh sách ảnh.');
  const options=cfg.channels.flatMap(channel=>valid.filter(p=>channel!=='instagram'||cfg.max_images>0&&images?.some(i=>i.product_id===p.id)).map(product=>({channel,product})));
  const {data:previous,error:previousError}=await db.from('affiliate_automation_jobs').select('product_id').eq('owner_id',owner).eq('status','done').order('created_at',{ascending:false}).limit(1);if(previousError)throw new Error('Không đọc được lịch sử sản phẩm.');
  if(!options.length)return finish('skipped','Không còn sản phẩm có lượt đăng trong buổi này. Chờ buổi tiếp theo hoặc bổ sung sản phẩm đủ điều kiện.');
  const alternatives=options.filter(o=>o.product.id!==previous?.[0]?.product_id);
  const random=()=>randomInt(0,1000000)/1000000;
  const selected=pickRandom(alternatives.length?alternatives:options,random);
  channel=selected.channel;stage='connection';
  const target=await automationTarget(db,owner,selected.channel);
  if(raw.targets?.[selected.channel]!==target.id)throw new Error('Đích đăng đã thay đổi. Lưu lại lịch để xác nhận tài khoản mới.');
  stage='token_check';
  const host=channel==='threads'?'https://graph.threads.net/v1.0':channel==='instagram'&&target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
  await metaRequest(`${host}/${target.id}?fields=id${target.appSecretProof?'&appsecret_proof='+encodeURIComponent(target.appSecretProof):''}`,target.token);
  stage='database';
  const {error:selectError}=await db.from('affiliate_automation_jobs').update({channel:selected.channel,product_id:selected.product.id}).eq('id',job);if(selectError)throw new Error('Không lưu được sản phẩm đã chọn.');
  // A terminated request has a hard 120s platform limit; only release AI locks older than 10 min.
  const {error:staleError}=await db.from('affiliate_content_runs').update({status:'failed'}).eq('owner_id',owner).eq('status','running').lt('created_at',new Date(Date.now()-600000).toISOString());if(staleError)throw new Error('Không kiểm tra được lượt AI cũ.');
  const ownedImages=imageChoices((images||[]).filter(i=>i.product_id===selected.product.id),cfg.max_images,random);
  stage='ai';
  const result=await generateContent(db,owner,{productId:selected.product.id,channels:[selected.channel],provider:cfg.provider,model:cfg.model,length:cfg.copy_length,angle:pickRandom(['problem','curiosity','benefit'],random),imageIds:ownedImages.map(i=>i.id)});
  stage='database';
  const post=result.posts?.[0];if(!post)throw new Error('Chưa có bài hợp lệ.');
  const {error:postError}=await db.from('affiliate_automation_jobs').update({post_id:post.id}).eq('id',job);if(postError)throw new Error('Không lưu được liên kết bài.');
  const {data:latest,error:latestError}=await db.from('affiliate_automation_settings').select('enabled,updated_at').eq('owner_id',owner).single();
  if(latestError||!latest?.enabled||latest.updated_at!==raw.updated_at)return finish('skipped','Cấu hình đã đổi hoặc tắt. Giữ bài ở bản nháp.');
  if(Date.now()-started>95000)throw new Error('Gần hết thời gian xử lý. Giữ bản nháp, không gửi Meta.');
  stage='publish';
  await publishContent(db,owner,{postId:post.id,body:post.body,imageIds:post.image_ids,action:'publish',approved:true,deadline:started+110000,expectedTargetId:raw.targets[selected.channel]});
  return finish('done','Đã tạo và đăng 1 bài.');
 }catch(error){
  const detail=explainError(error,stage);
  const {error:logError}=await db.from('affiliate_automation_errors').insert({owner_id:owner,job_id:job,channel,...detail});
  const {error:pauseError}=await db.from('affiliate_automation_settings').update({enabled:false,updated_at:new Date().toISOString()}).eq('owner_id',owner);
  return finish('failed',`${pauseError?'Không xác nhận được tắt lịch.':'Lịch đã tạm dừng.'} ${logError?'Không lưu được chi tiết lỗi; kiểm tra kết nối cơ sở dữ liệu.':'Xem Nhật ký lỗi trong 8 giờ để biết nguyên nhân và cách xử lý.'}`);
 }
}
