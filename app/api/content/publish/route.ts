import { authorize, env, failure, metaPost, readBody } from '@/lib/content-server';
import { DISCLOSURE, validatePost } from '@/lib/content-rules';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { db,user } = await authorize(request);
    const { postId,body,approved,action } = await readBody(request);
    if(typeof body!=='string') throw new Error('Nội dung không hợp lệ.');
    const { data:post,error } = await db.from('affiliate_content_posts').select('*').eq('id',postId).eq('owner_id',user.id).single();
    if(error || !post) throw new Error('Không tìm thấy bản nháp.');
    if(post.status!=='draft') throw new Error('Bài này đã được gửi hoặc đang chờ xác minh. Không gửi lại để tránh trùng.');
    validatePost(post.channel,body);
    const { data:product } = await db.from('affiliate_products').select('affiliate_url').eq('id',post.product_id).eq('owner_id',user.id).single();
    if(!product || !body.includes(product.affiliate_url) || !body.includes(DISCLOSURE)) throw new Error('Giữ link affiliate gốc và dòng thông báo hoa hồng trong bài.');
    if(action==='save') {
      const {data,error:saveError}=await db.from('affiliate_content_posts').update({body}).eq('id',post.id).eq('owner_id',user.id).eq('status','draft').select().maybeSingle();
      if(saveError || !data) throw new Error('Không lưu được: trạng thái bài đã thay đổi.');
      return Response.json({post:data});
    }
    if(approved!==true) throw new Error('Bạn cần duyệt nội dung trước khi đăng.');
    const facebook=post.channel==='facebook';
    const target=env(facebook?'FACEBOOK_PAGE_ID':'THREADS_USER_ID');
    const token=env(facebook?'FACEBOOK_PAGE_ACCESS_TOKEN':'THREADS_ACCESS_TOKEN');
    const version=facebook?env('META_GRAPH_VERSION'):'v1.0';
    if(!/^\d+$/.test(target) || !/^v\d+\.\d+$/.test(version)) throw new Error('ID tài khoản hoặc phiên bản API chưa hợp lệ.');
    // Atomic compare-and-set means only one request can send this draft, across tabs/instances.
    const {data:claim,error:claimError}=await db.from('affiliate_content_posts').update({body,status:'publishing',target_id:target}).eq('id',post.id).eq('owner_id',user.id).eq('status','draft').select().maybeSingle();
    if(claimError || !claim) throw new Error('Bài đang được gửi ở nơi khác. Hãy làm mới lịch sử.');
    try {
      let externalId:string;
      if(facebook) externalId=await metaPost(`https://graph.facebook.com/${version}/${target}/feed`,token,{message:body});
      else {
        const container=await metaPost(`https://graph.threads.net/v1.0/${target}/threads`,token,{media_type:'TEXT',text:body});
        const {error:containerError}=await db.from('affiliate_content_posts').update({container_id:container}).eq('id',post.id);
        if(containerError) throw new Error('Không lưu được mã container Threads; dừng trước khi publish.');
        externalId=await metaPost(`https://graph.threads.net/v1.0/${target}/threads_publish`,token,{creation_id:container});
      }
      const {data:saved,error:saveError}=await db.from('affiliate_content_posts').update({status:'published',external_id:externalId,published_at:new Date().toISOString()}).eq('id',post.id).select().single();
      if(saveError) throw new Error('Meta đã nhận bài nhưng chưa lưu được lịch sử. Kiểm tra tài khoản đích, không bấm gửi lại.');
      return Response.json({post:saved});
    } catch(error) {
      await db.from('affiliate_content_posts').update({status:'unknown'}).eq('id',post.id).eq('status','publishing');
      throw new Error(`${error instanceof Error ? error.message : 'Lỗi kết nối Meta.'} Trạng thái cần xác minh; không tự thử lại.`);
    }
  } catch(error) { return failure(error); }
}
