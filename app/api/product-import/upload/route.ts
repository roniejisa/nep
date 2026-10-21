import {authorize,failure} from '@/lib/content-server';
import {importedWebP,storeImportedImage} from '@/lib/product-image-worker';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){try{
 const {db,user}=await authorize(request);
 if(Number(request.headers.get('content-length'))>2300000)throw new Error('Ảnh WebP vượt 2 MB.');
 const form=await request.formData(),file=form.get('file'),productId=form.get('productId');
 if(!(file instanceof File)||file.type!=='image/webp'||file.size>2097152||typeof productId!=='string'||!/^[0-9a-f-]{36}$/i.test(productId))throw new Error('Chọn ảnh WebP tối đa 2 MB và sản phẩm hợp lệ.');
 const {data:product,error}=await db.from('affiliate_products').select('id').eq('id',productId).eq('owner_id',user.id).single();if(error||!product)throw new Error('Không tìm thấy sản phẩm của bạn.');
 const input=Buffer.from(await file.arrayBuffer());if(input.toString('ascii',0,4)!=='RIFF'||input.toString('ascii',8,12)!=='WEBP')throw new Error('Dữ liệu không phải ảnh WebP.');
 const result=await storeImportedImage(db,user.id,product.id,await importedWebP(input),file.name);
 await db.from('affiliate_product_image_jobs').update({status:'done',error:null,updated_at:new Date().toISOString()}).eq('product_id',product.id).eq('owner_id',user.id).neq('status','running');
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
