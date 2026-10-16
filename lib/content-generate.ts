import {postImages} from '@/lib/post-images';
import {postFormat} from '@/lib/reel-rules';
import { generateCopy,type RetryOptions } from '@/lib/ai-provider';
import { composePost, validatePost, selectedChannels, contentBrief,validateGeneratedCopy } from '@/lib/content-rules';
import type {SupabaseClient} from '@supabase/supabase-js';
export async function generateContent(db:SupabaseClient,ownerId:string,input:Record<string,any>,retry:RetryOptions={}){
 let cleanup:(()=>Promise<void>)|undefined;
 try{
    const { productId, provider: chosenProvider, model: chosenModel,channels:requestedChannels,length='short',angle='problem',imageId=null } = input;
    const channels=selectedChannels(requestedChannels??['facebook','threads']);
    const format=postFormat(input.postFormat),videoId=format==='reel'?input.videoId:null;
    if(format==='reel'&&channels.includes('threads'))throw new Error('Threads không có định dạng Reel. Chọn Facebook hoặc Instagram.');
    const brief=contentBrief(length,angle);
    const { data: product, error } = await db.from('affiliate_products').select('id,name,description,category,variant,affiliate_url').eq('id', productId).eq('owner_id', ownerId).single();
    if (error || !product) throw new Error('Không tìm thấy sản phẩm của bạn.');
    if (!product.name.trim() || !product.description.trim()) throw new Error('Bổ sung tên và mô tả sản phẩm trước khi viết bài.');
    const imageIds=format==='reel'?[]:postImages(input.imageIds,imageId);
    if(format==='reel'){
      if(typeof videoId!=='string'||!/^[0-9a-f-]{36}$/i.test(videoId))throw new Error('Chọn video đã lưu của sản phẩm để tạo Reel.');
      const {data:video,error:videoError}=await db.from('affiliate_product_videos').select('id').eq('id',videoId).eq('product_id',product.id).eq('owner_id',ownerId).eq('approved',true).single();
      if(videoError||!video)throw new Error('Video phải thuộc sản phẩm và đã được xác nhận sử dụng.');
    }
    if(imageIds.length){const {data:images,error:imgError}=await db.from('affiliate_product_images').select('id').in('id',imageIds).eq('product_id',product.id).eq('owner_id',ownerId);if(imgError||images?.length!==imageIds.length)throw new Error('Ảnh phải thuộc cùng sản phẩm và tài khoản.');}
    const activeChannels=channels.filter(c=>format==='reel'||c!=='instagram'||imageIds.length>0);
    if(!activeChannels.length)throw new Error('Sản phẩm không có ảnh được chọn, không thể tạo bài Instagram. Chọn Facebook hoặc Threads.');
    // Keep one active AI run per owner; no application-imposed daily AI quota.
    const { data: run, error: lockError } = await db.from('affiliate_content_runs').insert({ owner_id: ownerId }).select().single();
    if (lockError) throw new Error('Chưa thể tạo bài: hãy chạy content.sql; nếu đã chạy, có thể một lượt AI khác đang hoạt động.');
    cleanup = async () => { await db.from('affiliate_content_runs').update({ status: 'failed' }).eq('id', run.id).eq('status','running'); };
    const { output, tokens, provider, model, attempts } = await generateCopy(
      brief.instructions+(format==='reel'?' Bạn đang viết mô tả ngắn cho Reel dùng video có sẵn, không phải kịch bản video. Không khẳng định đã gắn thẻ sản phẩm/giỏ hàng hoặc link bấm trực tiếp.':''),
      JSON.stringify({ name:product.name.slice(0,300), description:product.description.slice(0,6000), category:product.category,variant:product.variant.slice(0,300) }),
      { provider: chosenProvider, model: chosenModel },
      {...retry,validate:output=>{
        for(const channel of activeChannels){
          validateGeneratedCopy(output[channel],brief.limits[channel]);
          validatePost(channel,composePost(output[channel],product.affiliate_url));
        }
      }}
    );
    const rows = activeChannels.map(channel => {
      if (typeof output[channel] !== 'string' || typeof output.review !== 'string') throw new Error('AI trả nội dung sai định dạng.');
      validateGeneratedCopy(output[channel],brief.limits[channel]);
      const body = composePost(output[channel],product.affiliate_url);
      validatePost(channel,body);
      return { owner_id:ownerId,product_id:product.id,run_id:run.id,channel,body,review:output.review,image_id:imageIds[0]||null,image_ids:imageIds,provider,model,copy_length:length,post_format:format,video_id:videoId };
    });
    const { data: posts, error: saveError } = await db.from('affiliate_content_posts').insert(rows).select();
    if (saveError) throw new Error('Không lưu được bản nháp. Kiểm tra bảng nội dung trong Supabase.');
    await db.from('affiliate_content_runs').update({ status:'done',tokens,provider,model }).eq('id',run.id);
    return { posts,tokens,provider,model,attempts };
 }finally{if(cleanup)await cleanup();}
}
