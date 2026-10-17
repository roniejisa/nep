import {assertPublishingQuota} from '@/lib/publishing-quota';
import {postFormat,VIDEO_BUCKET,videoMetadata} from '@/lib/reel-rules';
import {publishReel} from '@/lib/reel-publish';
import {postImages} from '@/lib/post-images';
import {socialTarget} from '@/lib/social-connections';
import {instagramTarget} from '@/lib/instagram-connection';
import {env} from '@/lib/content-server';
import {composePost,affiliateComment,validatePost,isChannel} from '@/lib/content-rules';
import {publishAffiliateComment} from '@/lib/facebook-comment';
import {signImage} from '@/lib/social-image-token';
import {publishSocial} from '@/lib/social-publish';
import type {SupabaseClient} from '@supabase/supabase-js';
export async function publishContent(db:SupabaseClient,ownerId:string,input:Record<string,any>){
const {postId,approved,action,imageId,expectedTargetId}=input;
  if(typeof input.body!=='string')throw new Error('Nội dung không hợp lệ.');
  if(action!=='save'&&action!=='publish')throw new Error('Thao tác không hợp lệ.');
  const {data:post,error}=await db.from('affiliate_content_posts').select('*').eq('id',postId).eq('owner_id',ownerId).single();
  if(error||!post||!isChannel(post.channel))throw new Error('Không tìm thấy bản nháp hợp lệ.');
  if(post.status!=='draft')throw new Error('Bài đã gửi hoặc cần xác minh. Không gửi lại để tránh trùng.');
  const format=postFormat(post.post_format);
  if(format==='reel'&&post.channel==='threads')throw new Error('Threads không hỗ trợ Reel.');
  const {data:product}=await db.from('affiliate_products').select('affiliate_url').eq('id',post.product_id).eq('owner_id',ownerId).single();
  if(!product)throw new Error('Không tìm thấy sản phẩm và link affiliate gốc.');
  const body=composePost(input.body,product.affiliate_url,post.channel);
  validatePost(post.channel,body);
  const commentText=post.channel==='facebook'?affiliateComment(product.affiliate_url):null;
  if(!('affiliate_comment_status' in post))throw new Error('Chạy supabase/affiliate-placement.sql trước khi lưu hoặc đăng bài.');
  const selectedImages=format==='reel'?[]:postImages(input.imageIds??(imageId===undefined?post.image_ids:undefined),imageId===undefined?post.image_id:imageId);
  const selectedImage=selectedImages[0]||null;
  if(selectedImages.length){const {data:images,error:imgError}=await db.from('affiliate_product_images').select('id').in('id',selectedImages).eq('product_id',post.product_id).eq('owner_id',ownerId);if(imgError||images?.length!==selectedImages.length)throw new Error('Mọi ảnh phải thuộc cùng sản phẩm này.');}
  if(action==='save'){
   const {data,error:saveError}=await db.from('affiliate_content_posts').update({body,image_id:selectedImage,image_ids:selectedImages,affiliate_comment_text:commentText}).eq('id',post.id).eq('owner_id',ownerId).eq('status','draft').select().maybeSingle();if(saveError||!data)throw new Error('Không lưu được: trạng thái đã thay đổi.');return {post:data};
  }
  if(approved!==true)throw new Error('Duyệt nội dung trước khi đăng.');
  if(format==='feed'&&post.channel==='instagram'&&!selectedImage)throw new Error('Instagram bắt buộc có ảnh.');
  let videoUrl='';
  if(format==='reel'){
   const {data:video,error:videoError}=await db.from('affiliate_product_videos').select('*').eq('id',post.video_id).eq('product_id',post.product_id).eq('owner_id',ownerId).eq('approved',true).single();
   if(videoError||!video)throw new Error('Video Reel không còn tồn tại hoặc chưa được xác nhận.');
   videoMetadata(video);
   const {data:signed,error:signError}=await db.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path,3600);
   if(signError||!signed)throw new Error('Chưa cấp được link video riêng tư cho Meta.');
   videoUrl=signed.signedUrl;
  }
  const instagram=post.channel==='instagram',threads=post.channel==='threads';
  const target=instagram?await instagramTarget(db,ownerId):await socialTarget(db,ownerId,threads?'threads':'facebook');
  if(typeof expectedTargetId==='string'&&expectedTargetId&&expectedTargetId!==target.id)throw new Error('Tài khoản đích đã thay đổi. Làm mới và duyệt lại bài trước khi đăng.');
  if(!/^\d+$/.test(target.id)||!/^v\d+\.\d+$/.test(target.version))throw new Error('ID tài khoản hoặc phiên bản API không hợp lệ.');
  const imageUrls:string[]=[];
  if(selectedImages.length){const base=new URL(env('PUBLIC_SITE_URL'));if(base.protocol!=='https:')throw new Error('PUBLIC_SITE_URL phải dùng HTTPS.');for(const id of selectedImages)imageUrls.push(new URL(`/api/social-image/${signImage(id,process.env.SOCIAL_IMAGE_SIGNING_SECRET||env('SUPABASE_SERVICE_ROLE_KEY'))}/`,base.origin).href);}
  await assertPublishingQuota(post.channel,target);
  const {data:reserved,error:reserveError}=await db.rpc('reserve_affiliate_product_post',{p_owner:ownerId,p_post:post.id});
  if(reserveError)throw new Error('Không xác nhận được bản nháp. Chạy automation-unrestricted.sql sau các migration trước đó.');
  if(!reserved)throw new Error('Chưa xác nhận được quyền đăng bản nháp. Nếu vẫn gặp giới hạn sáng/tối, hãy chạy automation-unrestricted.sql.');
  const {data:claim,error:claimError}=await db.from('affiliate_content_posts').update({body,image_id:selectedImage,image_ids:selectedImages,status:'publishing',target_id:target.id,affiliate_comment_text:commentText,affiliate_comment_status:commentText?'pending':'none'}).eq('id',post.id).eq('owner_id',ownerId).eq('status','draft').select().maybeSingle();
  if(claimError||!claim)throw new Error('Bài đang được gửi ở nơi khác. Hãy làm mới lịch sử.');
  try{
   const onContainer=async(id:string)=>{const {error}=await db.from('affiliate_content_posts').update({container_id:id}).eq('id',post.id).eq('owner_id',ownerId);if(error)throw new Error('Không lưu được container, dừng trước khi publish.');};
   const result=format==='reel'?await publishReel({channel:post.channel as 'facebook'|'instagram',body,videoUrl,target,deadline:input.deadline,onContainer}):await publishSocial({channel:post.channel,body,imageUrls,target,deadline:input.deadline,onContainer});
   const {data:saved,error:saveError}=await db.from('affiliate_content_posts').update({status:'published',external_id:result.id,published_at:new Date().toISOString()}).eq('id',post.id).select().single();if(saveError)throw new Error('Meta đã nhận bài nhưng chưa lưu được lịch sử. Kiểm tra tài khoản đích.');
   if(post.channel==='facebook'){
    const comment=await publishAffiliateComment(db,ownerId,post.id,target,input.deadline);
    return {post:comment.post||saved,warning:comment.warning};
   }
   return {post:saved};
  }catch(error){await db.from('affiliate_content_posts').update({status:'unknown'}).eq('id',post.id).eq('status','publishing');throw new Error(`${error instanceof Error?error.message:'Lỗi kết nối Meta.'} Cần xác minh trên Meta; không tự gửi lại.`,{cause:error});}
}
