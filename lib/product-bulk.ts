import type {SupabaseClient} from '@supabase/supabase-js';
import {readyIssues,sourceDescription} from './product-readiness';
export type BulkAction='ready'|'draft'|'archived'|'category';
export type BulkInput={action:BulkAction;ids:string[];confirmed:boolean;fillFromFacts:boolean;category:string};
export function bulkInput(value:Record<string,unknown>):BulkInput{
 if(!['ready','draft','archived','category'].includes(String(value.action)))throw new Error('Thao tác hàng loạt không hợp lệ.');
 if(!Array.isArray(value.ids)||!value.ids.length||value.ids.length>1000||value.ids.some(id=>typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))throw new Error('Chọn từ 1 đến 1.000 sản phẩm hợp lệ.');
 if(value.action==='ready'&&value.confirmed!==true)throw new Error('Xác nhận thông tin nguồn trước khi chuyển Sẵn sàng.');
 if(value.fillFromFacts!==undefined&&typeof value.fillFromFacts!=='boolean')throw new Error('Lựa chọn thông tin nguồn không hợp lệ.');
 const category=typeof value.category==='string'?value.category.trim():'';
 if(value.action==='category'&&(!category||category.length>80))throw new Error('Tên danh mục từ 1 đến 80 ký tự.');
 return {action:value.action as BulkAction,ids:[...new Set(value.ids as string[])],confirmed:value.confirmed===true,fillFromFacts:value.fillFromFacts===true,category};
}
export type BulkResult={id:string;name:string;state:'updated'|'unchanged'|'blocked'|'conflict'|'error'|'deferred';message:string};
export async function applyProductBulk(db:SupabaseClient,owner:string,input:BulkInput,deadline=Date.now()+220000){
 const products:any[]=[];
 for(let start=0;start<input.ids.length;start+=150){
  const {data,error}=await db.from('affiliate_products').select('id,name,description,affiliate_url,shop_name,variant,status,verified_at,category,updated_at').eq('owner_id',owner).in('id',input.ids.slice(start,start+150)).abortSignal(AbortSignal.timeout(20000));
  if(error)throw new Error('Chưa đọc được sản phẩm; chưa áp dụng thay đổi hàng loạt.');
  products.push(...(data||[]));
 }
 const byId=new Map(products.map(p=>[p.id,p])),results=new Array<BulkResult>(input.ids.length);let cursor=0;
 async function worker(){while(cursor<input.ids.length){
  const index=cursor++,id=input.ids[index],p=byId.get(id),result=(state:BulkResult['state'],message:string)=>{results[index]={id,name:p?.name||'Sản phẩm không còn trong kho',state,message};};
  if(!p){result('blocked','Không tìm thấy sản phẩm thuộc tài khoản hiện tại.');continue;}
  if(Date.now()>deadline){result('deferred','Chưa xử lý trong lượt này. Chọn lại để tiếp tục.');continue;}
  const changes:Record<string,string>={};
  if(input.action==='ready'){
   const issues=readyIssues(p,input.fillFromFacts);if(issues.length){result('blocked',issues.join(' · '));continue;}
   if(!p.description.trim())changes.description=sourceDescription(p);
   if(!p.verified_at)changes.verified_at=new Date().toISOString();
   if(p.status!=='ready')changes.status='ready';
  }else if(input.action==='category'){if(p.category!==input.category)changes.category=input.category;}
  else if(p.status!==input.action)changes.status=input.action;
  if(!Object.keys(changes).length){result('unchanged','Đã ở trạng thái yêu cầu; không ghi lại.');continue;}
  try{
   const {data,error}=await db.from('affiliate_products').update(changes).eq('owner_id',owner).eq('id',id).eq('updated_at',p.updated_at).select('id').abortSignal(AbortSignal.timeout(20000));
   if(error)result('error','Chưa xác nhận lưu thành công. Làm mới kho trước khi thử lại.');
   else if(!data?.length)result('conflict','Sản phẩm vừa được sửa hoặc xóa ở nơi khác. Làm mới rồi thử lại.');
   else result('updated',input.action==='ready'?'Đã xác nhận nguồn và chuyển Sẵn sàng.':'Đã cập nhật.');
  }catch{result('error','Mất kết nối; chưa xác nhận kết quả. Làm mới kho trước khi thử lại.');}
 }}
 await Promise.all(Array.from({length:Math.min(4,input.ids.length)},()=>worker()));
 return {results,updated:results.filter(r=>r.state==='updated').length,unchanged:results.filter(r=>r.state==='unchanged').length,blocked:results.filter(r=>r.state==='blocked').length,failed:results.filter(r=>['conflict','error','deferred'].includes(r.state)).length};
}
