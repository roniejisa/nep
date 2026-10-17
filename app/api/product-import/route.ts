import {authorize,failure} from '@/lib/content-server';
import {analyzeImport,type ImportFile} from '@/lib/product-import';
import {runProductImages} from '@/lib/product-image-worker';
import {requestPage} from '@/lib/pagination';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
async function input(request:Request){if(Number(request.headers.get('content-length'))>2100000)throw new Error('Tổng CSV vượt 2 MB.');const text=await request.text();if(Buffer.byteLength(text)>2100000)throw new Error('Tổng CSV vượt 2 MB.');return JSON.parse(text);}
export async function GET(request:Request){try{
 const {db,user}=await authorize(request),url=new URL(request.url),page=requestPage(url.searchParams.get('page')),status=url.searchParams.get('status')||'all',size=12;
 let query=db.from('affiliate_product_image_jobs').select('*,product:affiliate_products(name,external_product_id)',{count:'exact'}).eq('owner_id',user.id);
 if(['pending','running','done','failed'].includes(status))query=query.eq('status',status);
 const result=await query.order('updated_at',{ascending:false}).order('product_id').range((page-1)*size,page*size-1);
 if(result.error)throw new Error('Chạy supabase/product-import.sql để bật nhập CSV và hàng đợi ảnh.');
 const counts=await Promise.all(['pending','running','done','failed'].map(async status=>{const {count,error}=await db.from('affiliate_product_image_jobs').select('product_id',{head:true,count:'exact'}).eq('owner_id',user.id).eq('status',status);if(error)throw new Error('Chưa đọc được hàng đợi ảnh.');return [status,count||0] as const;}));
 return Response.json({jobs:result.data,total:result.count,counts:Object.fromEntries(counts),pageSize:size},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,user}=await authorize(request),body=await input(request);
 if(body.action==='work')return Response.json(await runProductImages(db,user.id),{headers:{'Cache-Control':'no-store'}});
 if(body.action==='retry'){
  if(!Array.isArray(body.productIds)||!body.productIds.length||body.productIds.length>100||body.productIds.some((id:unknown)=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))throw new Error('Chọn 1–100 sản phẩm cần thử lấy ảnh lại.');
  const {data,error}=await db.from('affiliate_product_image_jobs').update({status:'pending',attempts:0,error:null,claimed_at:null,updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('status','failed').in('product_id',body.productIds).select('product_id');if(error)throw new Error('Không xếp lại được các ảnh lỗi.');return Response.json({queued:data?.length||0});
 }
 if(!['preview','commit'].includes(body.action))throw new Error('Thao tác nhập không hợp lệ.');
 const files:ImportFile[]=body.files,report=analyzeImport(files);
 const {data:existing,error:schemaError}=await db.from('affiliate_products').select('id,name,external_product_id,source_url,affiliate_url').eq('owner_id',user.id).limit(1001);
 const {error:jobSchema}=await db.from('affiliate_product_image_jobs').select('product_id').eq('owner_id',user.id).limit(1);
 if(schemaError||jobSchema)throw new Error('Chạy supabase/product-import.sql sau automation-flex.sql trước khi nhập.');
 if((existing?.length||0)>1000)throw new Error('Kho hiện vượt 1.000 sản phẩm; cần mở rộng giới hạn kho trước khi nhập thêm.');
 if(body.action==='preview'){
  for(const line of report.lines){if(!line.item)continue;const item=line.item;const matches=(existing||[]).filter(p=>p.external_product_id===item.external_product_id||p.source_url===item.source_url||p.affiliate_url===item.affiliate_url);if(matches.length){line.state='existing';line.message=matches.length>1?'Có nhiều bản ghi khớp; cần kiểm tra, không tạo thêm.':'Đã có trong kho; không ghi đè thông tin. Nếu thiếu ảnh, có thể xếp hàng lấy ảnh.';}}
  return Response.json({...report,items:undefined,remainingCapacity:Math.max(0,1000-(existing?.length||0))},{headers:{'Cache-Control':'no-store'}});
 }
 const category=typeof body.category==='string'?body.category.trim():'';
 if(!category||category.length>80||typeof body.fetchImages!=='boolean'||!Number.isInteger(body.maxImages)||body.maxImages<1||body.maxImages>6||body.confirmed!==true)throw new Error('Chọn danh mục, số ảnh và xác nhận nhập Nháp.');
 const results:Record<string,any>[]=[],started=Date.now();
 for(const item of report.items){
  if(Date.now()-started>240000){results.push({key:item.key,state:'deferred',message:'Hết thời gian lượt nhập. Nhập lại CSV để tiếp tục, sản phẩm đã có sẽ được bỏ qua.'});continue;}
  const {data,error}=await db.rpc('import_affiliate_product',{p_owner:user.id,p_item:item,p_category:category,p_images:body.maxImages,p_fetch:body.fetchImages});
  results.push({key:item.key,name:item.name,...(error?{state:error.code==='23505'?'existing':'error',message:error.code==='23505'?'Mã sản phẩm hoặc link vừa được nhập ở lượt khác; không tạo trùng.':`Không lưu được dòng (mã ${error.code||'database'}). Có thể nhập lại an toàn.`}:data)});
 }
 return Response.json({results,duplicates:report.lines.filter(l=>l.state==='duplicate').length,invalid:report.lines.filter(l=>l.state==='invalid'),inserted:results.filter(r=>r.state==='inserted').length,existing:results.filter(r=>r.state==='existing').length},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
