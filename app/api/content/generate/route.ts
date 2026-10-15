import { authorize, failure, readBody } from '@/lib/content-server';
import { generateCopy } from '@/lib/ai-provider';
import { composePost, validatePost, selectedChannels, contentBrief,validateGeneratedCopy } from '@/lib/content-rules';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const { db, user } = await authorize(request);
    const { productId, provider: chosenProvider, model: chosenModel,channels:requestedChannels,length='short',angle='problem',imageId=null } = await readBody(request);
    const channels=selectedChannels(requestedChannels??['facebook','threads']);
    const brief=contentBrief(length,angle);
    const { data: product, error } = await db.from('affiliate_products').select('id,name,description,category,variant,affiliate_url').eq('id', productId).eq('owner_id', user.id).single();
    if (error || !product) throw new Error('Không tìm thấy sản phẩm của bạn.');
    if (!product.name.trim() || !product.description.trim()) throw new Error('Bổ sung tên và mô tả sản phẩm trước khi viết bài.');
    let image:string|null=null;
    if(imageId){const {data:img,error:imgError}=await db.from('affiliate_product_images').select('id').eq('id',imageId).eq('product_id',product.id).eq('owner_id',user.id).single();if(imgError||!img)throw new Error('Ảnh không thuộc sản phẩm hoặc tài khoản của bạn.');image=img.id;}
    if(channels.includes('instagram')&&!image)throw new Error('Instagram cần ảnh. Chọn ảnh sản phẩm trước khi tạo bài.');
    // Reserve one slot before counting daily usage: concurrent clicks cannot both call AI.
    const { data: run, error: lockError } = await db.from('affiliate_content_runs').insert({ owner_id: user.id }).select().single();
    if (lockError) throw new Error('Chưa thể tạo bài: hãy chạy content.sql; nếu đã chạy, có thể một lượt AI khác đang hoạt động.');
    cleanup = async () => { await db.from('affiliate_content_runs').update({ status: 'failed' }).eq('id', run.id).eq('status','running'); };
    const { count, error: countError } = await db.from('affiliate_content_runs').select('id', { head: true, count: 'exact' }).eq('owner_id',user.id).gte('created_at',new Date(Date.now()-86400000).toISOString());
    if (countError || (count ?? 0) > 30) throw new Error('Đã đạt giới hạn 30 lượt trong 24 giờ hoặc không đọc được hạn mức.');
    const { output, tokens, provider, model } = await generateCopy(
      brief.instructions,
      JSON.stringify({ name:product.name.slice(0,300), description:product.description.slice(0,6000), category:product.category,variant:product.variant.slice(0,300) }),
      { provider: chosenProvider, model: chosenModel }
    );
    const rows = channels.map(channel => {
      if (typeof output[channel] !== 'string' || typeof output.review !== 'string') throw new Error('AI trả nội dung sai định dạng.');
      validateGeneratedCopy(output[channel],brief.limits[channel]);
      const body = composePost(output[channel],product.affiliate_url);
      validatePost(channel,body);
      return { owner_id:user.id,product_id:product.id,run_id:run.id,channel,body,review:output.review,image_id:image,provider,model,copy_length:length };
    });
    const { data: posts, error: saveError } = await db.from('affiliate_content_posts').insert(rows).select();
    if (saveError) throw new Error('Không lưu được bản nháp. Kiểm tra bảng nội dung trong Supabase.');
    await db.from('affiliate_content_runs').update({ status:'done',tokens,provider,model }).eq('id',run.id);
    return Response.json({ posts,tokens,provider,model });
  } catch(error) { return failure(error); }
  finally { if(cleanup) await cleanup(); }
}
