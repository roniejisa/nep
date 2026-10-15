import {socialJpeg} from '@/lib/social-jpeg';
import {database,env} from '@/lib/content-server';
import {verifyImage} from '@/lib/social-image-token';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;const id=verifyImage(token,process.env.SOCIAL_IMAGE_SIGNING_SECRET||env('SUPABASE_SERVICE_ROLE_KEY'));
  const db=database();const {data:image,error}=await db.from('affiliate_product_images').select('storage_path').eq('id',id).single();
  if(error||!image)throw new Error('Ảnh không còn tồn tại.');
  const {data:blob,error:downloadError}=await db.storage.from('affiliate-product-images').download(image.storage_path);if(downloadError||!blob||blob.size>2*1024*1024)throw new Error('Không đọc được ảnh.');
  const input=Buffer.from(await blob.arrayBuffer());const jpeg=await socialJpeg(input);
  return new Response(new Uint8Array(jpeg),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Content-Disposition':'inline; filename="product.jpg"'}});
 }catch{return new Response('Image unavailable or link expired',{status:404,headers:{'Cache-Control':'no-store'}});}
}
