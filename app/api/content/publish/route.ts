import {socialTarget} from '@/lib/social-connections';
import {instagramTarget} from '@/lib/instagram-connection';
import {authorize,env,failure,readBody} from '@/lib/content-server';
import {hasDisclosure,validatePost,isChannel} from '@/lib/content-rules';
import {signImage} from '@/lib/social-image-token';
import {publishSocial} from '@/lib/social-publish';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){
 try{
  const {db,user}=await authorize(request);const {postId,body,approved,action,imageId,expectedTargetId}=await readBody(request);
  if(typeof body!=='string')throw new Error('Nội dung không hợp lệ.');
  if(action!=='save'&&action!=='publish')throw new Error('Thao tác không hợp lệ.');
  const {data:post,error}=await db.from('affiliate_content_posts').select('*').eq('id',postId).eq('owner_id',user.id).single();
  if(error||!post||!isChannel(post.channel))throw new Error('Không tìm thấy bản nháp hợp lệ.');
  if(post.status!=='draft')throw new Error('Bài đã gửi hoặc cần xác minh. Không gửi lại để tránh trùng.');
  validatePost(post.channel,body);
  const {data:product}=await db.from('affiliate_products').select('affiliate_url').eq('id',post.product_id).eq('owner_id',user.id).single();
  if(!product||!body.includes(product.affiliate_url)||!hasDisclosure(body))throw new Error('Giữ link affiliate gốc và thông báo hoa hồng trong bài.');
  const selectedImage=imageId===undefined?post.image_id:imageId;
  if(selectedImage){const {data:img,error:imgError}=await db.from('affiliate_product_images').select('id').eq('id',selectedImage).eq('product_id',post.product_id).eq('owner_id',user.id).single();if(imgError||!img)throw new Error('Ảnh không thuộc sản phẩm này.');}
  if(action==='save'){
   const {data,error:saveError}=await db.from('affiliate_content_posts').update({body,image_id:selectedImage||null}).eq('id',post.id).eq('owner_id',user.id).eq('status','draft').select().maybeSingle();if(saveError||!data)throw new Error('Không lưu được: trạng thái đã thay đổi.');return Response.json({post:data});
  }
  if(approved!==true)throw new Error('Duyệt nội dung trước khi đăng.');
  if(post.channel==='instagram'&&!selectedImage)throw new Error('Instagram bắt buộc có ảnh.');
  const instagram=post.channel==='instagram',threads=post.channel==='threads';
  const target=instagram?await instagramTarget(db,user.id):await socialTarget(db,user.id,threads?'threads':'facebook');
  if(typeof expectedTargetId==='string'&&expectedTargetId&&expectedTargetId!==target.id)throw new Error('Tài khoản đích đã thay đổi. Làm mới và duyệt lại bài trước khi đăng.');
  if(!/^\d+$/.test(target.id)||!/^v\d+\.\d+$/.test(target.version))throw new Error('ID tài khoản hoặc phiên bản API không hợp lệ.');
  let imageUrl:string|undefined;
  if(selectedImage){const base=new URL(env('PUBLIC_SITE_URL'));if(base.protocol!=='https:')throw new Error('PUBLIC_SITE_URL phải dùng HTTPS.');imageUrl=new URL(`/api/social-image/${signImage(selectedImage,process.env.SOCIAL_IMAGE_SIGNING_SECRET||env('SUPABASE_SERVICE_ROLE_KEY'))}/`,base.origin).href;}
  const {data:claim,error:claimError}=await db.from('affiliate_content_posts').update({body,image_id:selectedImage||null,status:'publishing',target_id:target.id}).eq('id',post.id).eq('owner_id',user.id).eq('status','draft').select().maybeSingle();
  if(claimError||!claim)throw new Error('Bài đang được gửi ở nơi khác. Hãy làm mới lịch sử.');
  try{
   const result=await publishSocial({channel:post.channel,body,imageUrl,target,onContainer:async id=>{const {error}=await db.from('affiliate_content_posts').update({container_id:id}).eq('id',post.id).eq('owner_id',user.id);if(error)throw new Error('Không lưu được container, dừng trước khi publish.');}});
   const {data:saved,error:saveError}=await db.from('affiliate_content_posts').update({status:'published',external_id:result.id,published_at:new Date().toISOString()}).eq('id',post.id).select().single();if(saveError)throw new Error('Meta đã nhận bài nhưng chưa lưu được lịch sử. Kiểm tra tài khoản đích.');
   return Response.json({post:saved});
  }catch(error){await db.from('affiliate_content_posts').update({status:'unknown'}).eq('id',post.id).eq('status','publishing');throw new Error(`${error instanceof Error?error.message:'Lỗi kết nối Meta.'} Cần xác minh trên Meta; không tự gửi lại.`);}
 }catch(error){return failure(error);}
}
