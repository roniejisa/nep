import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),cache=new Map();let workspace;
function load(relative){
 if(cache.has(relative))return cache.get(relative);
 const source=readFileSync(new URL('../'+relative,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const module={exports:{}};cache.set(relative,module.exports);
 const mapped=name=>{
  if(name==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
  if(name==='@/components/admin-context')return {useAdmin:()=>workspace};
  if(name==='@/components/admin-ui')return {Spinner:()=>React.createElement('span',null,'loading'),EmptyArt:()=>null,money:value=>String(value),date:()=>'',statusNames:{draft:'Bản nháp',ready:'Sẵn sàng',archived:'Lưu trữ'}};
  if(name==='@/lib/supabase')return {supabase:{}};
  if(name.startsWith('@/')){const path=name.slice(2);return load(path+(path.startsWith('components/')?'.tsx':'.ts'));}
  return require(name);
 };
 new Function('require','module','exports',compiled)(mapped,module,module.exports);cache.set(relative,module.exports);return module.exports;
}
const ProductsScreen=load('components/products-screen.tsx').default;
function catalog(){
 const products=Array.from({length:199},(_,index)=>({id:String(index),name:'Sản phẩm CSV '+index,category:'Khác',description:'',affiliate_url:'https://s.shopee.vn/source',product_images:[],status:'draft',verified_at:null,shop_name:'Shop',price:98000,commission_rate:10,updated_at:'2026-10-17'}));
 return {products,filtered:products,productResults:{items:products.slice(0,12)},categories:['Khác'],loading:false,dbError:'',query:'',category:'Tất cả',status:'all',mediaFilter:'all',sort:'newest',productPage:1,display:'grid',totalCount:199,user:{id:'owner'},view:'products'};
}
test('CSV catalog exposes approve-all, page selection and all matching results without opening each card',()=>{
 workspace=catalog();const html=renderToStaticMarkup(React.createElement(ProductsScreen));
 assert.ok(html.includes('Cho tất cả sẵn sàng (199)'));assert.ok(html.includes('Chọn trang này (12)'));assert.ok(html.includes('Chọn tất cả 199 kết quả lọc'));assert.equal((html.match(/aria-label="Chọn Sản phẩm CSV /g)||[]).length,12);
 assert.ok(html.includes('Thiếu thông tin nguồn cho AI'));assert.ok(html.includes('Instagram cần ảnh'));assert.ok(html.includes('Nhập CSV'));
});
test('list view keeps selection and distinguishes a ready label from actual posting eligibility',()=>{
 workspace=catalog();workspace.display='list';workspace.products[0].status='ready';
 const html=renderToStaticMarkup(React.createElement(ProductsScreen));assert.equal((html.match(/aria-label="Chọn Sản phẩm CSV /g)||[]).length,12);assert.ok(html.includes('Cần bổ sung'));assert.ok(html.includes('Cho tất cả sẵn sàng (199)'));
});
