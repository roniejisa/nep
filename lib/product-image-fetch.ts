import {imageSourceURL,shopeeIdentity} from './product-import.ts';
const unescapeHTML=(value:string)=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(1114111,Number(n))));
export function pageImageURLs(html:string,source:string){
 const expected=shopeeIdentity(source);if(!expected)throw new Error('Link nguồn không có mã Shopee hợp lệ.');
 const result:string[]=[],metas:Record<string,string>={};
 for(const tag of html.match(/<meta\b[^>]{0,6000}>/gi)||[]){const attributes:Record<string,string>={};for(const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attributes[match[1].toLowerCase()]=unescapeHTML(match[2]??match[3]??match[4]);const key=attributes.property||attributes.name;if(key&&attributes.content)metas[key.toLowerCase()]=attributes.content;}
 let verifiedPage=false;
 if(metas['og:url']){const actual=shopeeIdentity(metas['og:url']);if(!actual||actual.itemId!==expected.itemId||actual.shopId!==expected.shopId)throw new Error('Trang trả về không xác nhận đúng sản phẩm; không lấy ảnh.');verifiedPage=true;}
 const add=(value:unknown)=>{if(typeof value!=='string')return;try{const url=imageSourceURL(value);if(!result.includes(url))result.push(url);}catch{}};
 const products:any[]=[];
 const visit=(value:any,depth=0)=>{if(depth>8||products.length>30||!value||typeof value!=='object')return;if(Array.isArray(value)){value.slice(0,50).forEach(x=>visit(x,depth+1));return;}if([value['@type']].flat().includes('Product'))products.push(value);if(value['@graph'])visit(value['@graph'],depth+1);};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].length>300000)continue;try{visit(JSON.parse(match[1]));}catch{}}
 if(products.some(product=>{const identity=typeof product.url==='string'?shopeeIdentity(product.url):null;return identity?.itemId===expected.itemId&&identity.shopId===expected.shopId||String(product.productID)===expected.itemId;}))verifiedPage=true;
 if(verifiedPage){add(metas['og:image:secure_url']);add(metas['og:image']);}
 for(const product of products){const identity=typeof product.url==='string'?shopeeIdentity(product.url):null;if(identity?.itemId!==expected.itemId&&!(products.length===1&&verifiedPage))continue;if(identity&&(identity.itemId!==expected.itemId||identity.shopId!==expected.shopId))continue;for(const image of [product.image].flat()){if(typeof image==='object'&&image)add(image.url||image.contentUrl);else add(image);}}
 return result.slice(0,6);
}
export async function limitedDownload(url:string,kind:'page'|'image',deadline:number,transport:typeof fetch=fetch){
 let current=url;const expected=kind==='page'?shopeeIdentity(url):null;
 for(let redirects=0;redirects<4;redirects++){
  if(kind==='image')imageSourceURL(current);else {const identity=shopeeIdentity(current);if(!identity||identity.itemId!==expected?.itemId||identity.shopId!==expected.shopId)throw new Error('Nguồn chuyển sang trang không phải sản phẩm gốc.');}
  const remaining=Math.min(8000,deadline-Date.now());if(remaining<1000)throw new Error('Hết thời gian lấy ảnh của lượt này.');
  let response:Response;try{response=await transport(current,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(remaining),headers:{Accept:kind==='page'?'text/html':'image/jpeg,image/png,image/webp','User-Agent':'NepProductImporter/2.11'}});}catch{throw new Error('Không kết nối được nguồn ảnh hoặc hết thời gian chờ.');}
  if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new Error('Nguồn chuyển hướng nhưng thiếu địa chỉ.');current=new URL(next,current).href;continue;}
  if(!response.ok){await response.body?.cancel();throw new Error(`Nguồn từ chối HTTP ${response.status}. Có thể bổ sung ảnh bằng file hoặc cột Link ảnh.`);}
  const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(kind==='page'&&!['text/html','application/xhtml+xml'].includes(mime)||kind==='image'&&!['image/jpeg','image/png','image/webp','application/octet-stream'].includes(mime)){await response.body?.cancel();throw new Error('Nguồn không trả đúng định dạng trang/ảnh.');}
  const max=kind==='page'?2000000:10000000;if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new Error('Dữ liệu nguồn quá lớn.');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Nguồn trả dữ liệu rỗng.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('Dữ liệu nguồn quá lớn.');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
 }
 throw new Error('Nguồn chuyển hướng quá nhiều lần.');
}
