import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {limitedDownload,pageImageURLs} from './product-image-fetch.ts';
import {imageSourceURL,shopeeIdentity} from './product-import.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
export async function importedWebP(input:Buffer){
 const jpeg=input[0]===255&&input[1]===216&&input[2]===255,png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),webp=input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP';
 if(!jpeg&&!png&&!webp)throw new Error('Dữ liệu nguồn không phải JPG/PNG/WebP.');
 const image=sharp(input,{limitInputPixels:40000000,animated:false}),metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format||'')||!metadata.width||!metadata.height||metadata.width<96||metadata.height<96)throw new Error('Ảnh phải là JPG/PNG/WebP, có kích thước tối thiểu 96px.');
 let output;
 for(const quality of [84,78,72]){output=await sharp(input,{limitInputPixels:40000000}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality}).toBuffer({resolveWithObject:true});if(output.data.length<=450*1024)break;}
 if(!output||output.data.length>2097152)throw new Error('Ảnh WebP vượt 2 MB sau khi nén.');
 return {data:output.data,width:output.info.width,height:output.info.height,originalBytes:input.length};
}
export async function storeImportedImage(db:SupabaseClient,owner:string,productId:string,image:Awaited<ReturnType<typeof importedWebP>>,name:string){
 const hash=createHash('sha256').update(image.data).digest('hex'),digest=createHash('sha256').update(`${owner}/${productId}/${hash}`).digest('hex');
 const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`,path=`${owner}/${productId}/${id}.webp`;
 const {data:existing,error:readError}=await db.from('affiliate_product_images').select('id').eq('owner_id',owner).eq('product_id',productId).eq('source_fingerprint',hash).maybeSingle();if(readError)throw new Error('Chưa kiểm tra được ảnh trùng. Chạy product-import.sql.');if(existing)return {id:existing.id,duplicate:true};
 const {count,error:countError}=await db.from('affiliate_product_images').select('id',{count:'exact',head:true}).eq('owner_id',owner).eq('product_id',productId);if(countError||(count??0)>=12)throw new Error('Sản phẩm đã đủ 12 ảnh hoặc chưa đọc được kho ảnh.');
 const {error:uploadError}=await db.storage.from('affiliate-product-images').upload(path,image.data,{contentType:'image/webp',upsert:false});
 if(uploadError){const value=uploadError as any;const duplicate=String(value.statusCode)==='409'||['Duplicate','ResourceAlreadyExists'].includes(value.error??value.code)||value.message==='The resource already exists';if(!duplicate)throw new Error('Chưa tải được ảnh WebP lên Storage.');}
 const {data:saved,error:insertError}=await db.from('affiliate_product_images').insert({id,owner_id:owner,product_id:productId,storage_path:path,source_fingerprint:hash,original_name:name.slice(0,240),size_bytes:image.data.length,original_bytes:image.originalBytes,width:image.width,height:image.height,sort_order:count??0}).select('id').single();
 if(insertError){const {data:confirmed}=await db.from('affiliate_product_images').select('id').eq('id',id).eq('owner_id',owner).eq('product_id',productId).maybeSingle();if(confirmed)return {id:confirmed.id,duplicate:true};
  // Do not delete on an uncertain insert response: the row may have committed.
  throw new Error('Chưa xác nhận bản ghi ảnh. Làm mới trước khi tải lại; file dùng tên cố định nên không tạo bản sao.');
 }
 return {id:saved.id,duplicate:false};
}
export async function runProductImages(db:SupabaseClient,owner:string,{deadline=Date.now()+45000,transport=fetch,limit=5}:{deadline?:number;transport?:typeof fetch;limit?:number}={}){
 const results:{productId:string;status:string;message:string}[]=[];
 while(results.length<limit&&Date.now()<deadline-5000){
  const {data:claimed,error}=await db.rpc('claim_affiliate_product_image',{p_owner:owner});if(error)throw new Error('Chưa nhận được hàng đợi ảnh. Chạy product-import.sql.');
  const job=claimed?.[0];if(!job)break;
  let status='done',message='Đã lưu ảnh WebP.';
  try{
   const {data:product,error:productError}=await db.from('affiliate_products').select('id,external_product_id,external_shop_id').eq('id',job.product_id).eq('owner_id',owner).single();
   const identity=shopeeIdentity(job.source_url);if(productError||!product||!identity||identity.itemId!==product.external_product_id||identity.shopId!==product.external_shop_id)throw new Error('Mã sản phẩm của hàng đợi không còn khớp nguồn.');
   const {count,error:countError}=await db.from('affiliate_product_images').select('id',{count:'exact',head:true}).eq('owner_id',owner).eq('product_id',product.id);if(countError)throw new Error('Chưa đọc được ảnh sản phẩm.');
   if(count){message='Sản phẩm đã có ảnh; giữ nguyên ảnh hiện tại.';}
   else {
    let urls:string[]=job.image_urls||[];const jobDeadline=Math.min(deadline-1000,Date.now()+32000);
    if(!urls.length){const html=await limitedDownload(identity.url,'page',jobDeadline,transport);urls=pageImageURLs(html.toString('utf8'),identity.url);}
    if(!urls.length)throw new Error('Trang Shopee không cung cấp ảnh công khai. Thêm cột Link ảnh hoặc tải file ảnh theo mã sản phẩm.');
    let saved=0,duplicates=0,lastError='';
    for(const [index,value] of urls.slice(0,job.max_images).entries()){
     try{const url=imageSourceURL(value),input=await limitedDownload(url,'image',jobDeadline,transport),image=await importedWebP(input);const stored=await storeImportedImage(db,owner,product.id,image,`Shopee-${identity.itemId}-${index+1}.webp`);if(stored.duplicate)duplicates++;else saved++;}
     catch(error){lastError=error instanceof Error?error.message:'Không lấy được ảnh.';}
    }
    if(!saved&&!duplicates)throw new Error(lastError||'Không lấy được ảnh hợp lệ.');
    message=`Đã lưu ${saved} ảnh WebP mới.${duplicates?` Bỏ ${duplicates} ảnh trùng.`:''}${lastError?' Một số ảnh chưa tải được; có thể bổ sung thủ công.':''}`;
   }
  }catch(error){status='failed';message=(error instanceof Error?error.message:'Không lấy được ảnh.').replace(/https?:\/\/\S+/g,'[URL]').slice(0,500);}
  const {data:finished,error:finishError}=await db.from('affiliate_product_image_jobs').update({status,error:status==='failed'?message:null,updated_at:new Date().toISOString()}).eq('product_id',job.product_id).eq('owner_id',owner).eq('status','running').eq('claimed_at',job.claimed_at).select('product_id').maybeSingle();
  if(finishError||!finished)throw new Error('Chưa lưu được kết quả lấy ảnh. Lượt bị ngắt sẽ được kiểm tra lại sau 3 phút.');
  results.push({productId:job.product_id,status,message});
 }
 return {results};
}
