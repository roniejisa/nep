import {metaRequest,type SocialTarget} from './social-publish.ts';
import {explainError,OperationError} from './operation-error.ts';
import type {SupabaseClient} from '@supabase/supabase-js';

// This runs only after the post's published ID has been durably saved.
// Claim once before sending; neither errors nor process restarts resend comments.
export async function publishAffiliateComment(db:SupabaseClient,ownerId:string,postId:string,target:SocialTarget,deadline=Date.now()+20000,transport:typeof fetch=fetch){
 let attempted=false;
 try{
  const {data:post,error}=await db.from('affiliate_content_posts').update({affiliate_comment_status:'sending'})
   .eq('id',postId).eq('owner_id',ownerId).eq('channel','facebook').eq('status','published')
   .eq('target_id',target.id).eq('affiliate_comment_status','pending').select().maybeSingle();
  if(error)throw new OperationError('Bài đã đăng nhưng chưa nhận được quyền gửi bình luận.','database');
  if(!post)return {warning:'Bài đã đăng; bình luận đã được xử lý hoặc cần kiểm tra trạng thái. Không gửi lại tự động.'};
  if(!/^[0-9]+(?:_[0-9]+)?$/.test(post.external_id||'')||!post.affiliate_comment_text)throw new OperationError('Bài đã đăng nhưng thiếu mã bài hoặc nội dung bình luận.','configuration');
  const time=deadline-Date.now();
  if(time<1500)throw new OperationError('Bài đã đăng nhưng không đủ thời gian gửi bình luận.','network');
  attempted=true;
  const data=await metaRequest(`https://graph.facebook.com/${target.version}/${post.external_id}/comments`,target.token,
   {message:post.affiliate_comment_text,...(target.appSecretProof?{appsecret_proof:target.appSecretProof}:{})},transport,Math.min(15000,time));
  if(!data.id)throw new OperationError('Facebook chưa trả mã bình luận; kiểm tra trực tiếp trước khi thêm thủ công.','meta');
  const {data:saved,error:saveError}=await db.from('affiliate_content_posts').update({affiliate_comment_status:'sent',affiliate_comment_id:String(data.id),affiliate_comment_error:null})
   .eq('id',postId).eq('owner_id',ownerId).eq('affiliate_comment_status','sending').select().maybeSingle();
  if(saveError||!saved)throw new OperationError('Facebook đã nhận bình luận nhưng chưa lưu được mã. Kiểm tra trực tiếp; không gửi lại.','database');
  return {post:saved,warning:'Đã gửi bình luận chứa link. Bạn cần ghim bình luận trên Facebook.'};
 }catch(error){
  // Explicit API rejection is known failure. Transport/response/storage uncertainty is not safe to retry.
  const rejected=error instanceof OperationError&&error.code!==null;
  const status=attempted&&!rejected?'unknown':'failed';
  const detail=explainError(error,'affiliate_comment');
  const warning=`Bài đã đăng. ${status==='unknown'?'Chưa xác minh được bình luận':'Chưa gửi được bình luận'}: ${detail.message} Kiểm tra bài trên Facebook trước khi thêm link thủ công. Lịch vẫn bật.`;
  let saved;
  try{const result=await db.from('affiliate_content_posts').update({affiliate_comment_status:status,affiliate_comment_error:detail.message})
   .eq('id',postId).eq('owner_id',ownerId).eq('affiliate_comment_status','sending').select().maybeSingle();saved=result.data;}catch{}
  try{await db.from('affiliate_automation_errors').insert({owner_id:ownerId,channel:'facebook',...detail,advice:'Bài đã đăng, không đăng lại. Kiểm tra bình luận; nếu chưa có, thêm link thủ công. Thiếu quyền: kết nối lại Facebook với pages_manage_engagement.'});}catch{}
  return {post:saved||undefined,warning};
 }
}
