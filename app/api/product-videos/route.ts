import {authorize,failure,readBody} from '@/lib/content-server';
import {VIDEO_BUCKET,videoMetadata} from '@/lib/reel-rules';
import {requestPage} from '@/lib/pagination';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {db,user}=await authorize(request),params=new URL(request.url).searchParams,productId=params.get('productId'),page=requestPage(params.get('page')),size=6;
 if(!uuid(productId))throw new Error('Chọn sản phẩm trước khi mở video.');
 const {data,error,count}=await db.from('affiliate_product_videos').select('*',{count:'exact'}).eq('owner_id',user.id).eq('product_id',productId).order('created_at',{ascending:false}).order('id').range((page-1)*size,page*size-1);
 if(error)throw new Error('Chưa đọc được video. Chạy reels.sql sau các migration trước đó.');
 const videos=await Promise.all((data||[]).map(async video=>{const {data:signed}=await db.storage.from(VIDEO_BUCKET).createSignedUrl(video.storage_path,900);return {...video,url:signed?.signedUrl};}));
 return Response.json({videos,total:count,pageSize:size},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,user}=await authorize(request),input=await readBody(request);
 if(!uuid(input.id)||!uuid(input.product_id))throw new Error('Video hoặc sản phẩm không hợp lệ.');
 const {data:product}=await db.from('affiliate_products').select('id').eq('id',input.product_id).eq('owner_id',user.id).single();
 if(!product)throw new Error('Sản phẩm không thuộc tài khoản quản trị.');
 const path=`${user.id}/${input.product_id}/${input.id}.mp4`;
 videoMetadata(input);
 if(typeof input.original_name!=='string'||!input.original_name.trim()||input.original_name.length>240||input.approved!==true)throw new Error('Xác nhận video đúng sản phẩm và bạn có quyền sử dụng.');
 const {data:signed,error:signError}=await db.storage.from(VIDEO_BUCKET).createSignedUrl(path,60);
 if(signError||!signed)throw new Error('Video chưa được tải vào kho riêng tư.');
 const response=await fetch(signed.signedUrl,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('video/mp4')||Number(response.headers.get('content-length'))!==input.size_bytes)throw new Error('File tải lên không khớp video MP4 đã chọn.');
 const {error}=await db.from('affiliate_product_videos').insert({id:input.id,owner_id:user.id,product_id:input.product_id,storage_path:path,original_name:input.original_name,size_bytes:input.size_bytes,duration:input.duration,width:input.width,height:input.height,approved:true});
 if(error)throw new Error('Không lưu được video. Kiểm tra reels.sql hoặc video đã được lưu trước đó.');
 return Response.json({saved:true});
}catch(error){return failure(error);}}
export async function DELETE(request:Request){try{
 const {db,user}=await authorize(request),{id}=await readBody(request);if(!uuid(id))throw new Error('ID video không hợp lệ.');
 const {data:video}=await db.from('affiliate_product_videos').select('storage_path').eq('id',id).eq('owner_id',user.id).single();if(!video)throw new Error('Không tìm thấy video của bạn.');
 const {count,error:usageError}=await db.from('affiliate_content_posts').select('id',{head:true,count:'exact'}).eq('owner_id',user.id).eq('video_id',id).in('status',['draft','publishing','unknown']);
 if(usageError||count)throw new Error('Video đang dùng trong bản nháp/bài đang gửi hoặc cần xác minh. Xử lý các bài đó trước khi xóa.');
 const {error:storageError}=await db.storage.from(VIDEO_BUCKET).remove([video.storage_path]);if(storageError)throw new Error('Chưa xóa được video khỏi Storage.');
 const {error}=await db.from('affiliate_product_videos').delete().eq('id',id).eq('owner_id',user.id);if(error)throw new Error('Đã xóa file nhưng chưa xóa được metadata video.');
 return Response.json({deleted:true});
}catch(error){return failure(error);}}
