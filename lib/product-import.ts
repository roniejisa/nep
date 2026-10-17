export type ImportFile={name:string;text:string};
export type ImportItem={key:string;file:string;row:number;external_product_id:string;external_shop_id:string;name:string;affiliate_url:string;source_url:string;shop_name:string;price:number|null;commission_rate:number|null;description:string;image_urls:string[];metadata:Record<string,string>;warnings:string[]};
export type ImportLine={file:string;row:number;name:string;productId:string;state:'new'|'duplicate'|'invalid'|'existing';message:string;item?:ImportItem};
export const IMPORT_LIMIT=1000;
const headers={id:'Mã sản phẩm',name:'Tên sản phẩm',price:'Giá',shop:'Tên cửa hàng',rate:'Tỉ lệ hoa hồng',source:'Link sản phẩm',affiliate:'Link ưu đãi'};
export function csvRows(text:string){
 if(typeof text!=='string'||text.length>2000000)throw new Error('CSV vượt 2 MB.');
 text=text.replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/,1)[0],delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=char;}
  else if(char==='"'&&!cell&&!closed)quoted=true;
  else if(char===delimiter){row.push(cell);cell='';closed=false;}
  else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false;}
  else {if(closed&&!/\s/.test(char))throw new Error('CSV có ký tự sau dấu nháy đóng.');if(!closed)cell+=char;}
  if(cell.length>20000||row.length>40||rows.length>IMPORT_LIMIT+1)throw new Error('CSV quá nhiều dòng/cột hoặc một ô vượt 20.000 ký tự.');
 }
 if(quoted)throw new Error('CSV có dấu nháy chưa đóng.');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
export function shopeeIdentity(link:string){
 try{const url=new URL(link);if(url.protocol!=='https:'||!['shopee.vn','www.shopee.vn','m.shopee.vn'].includes(url.hostname)||url.port||url.username||url.password)return null;
 const match=url.pathname.match(/^\/product\/(\d+)\/(\d+)\/?$/)||url.pathname.match(/-i\.(\d+)\.(\d+)\/?$/);
 return match?{shopId:match[1],itemId:match[2],url:`https://shopee.vn/product/${match[1]}/${match[2]}`}:null;
 }catch{return null;}
}
export function shopeeAffiliateURL(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.port||url.username||url.password||!['s.shopee.vn','shope.ee','shopee.vn','www.shopee.vn'].includes(url.hostname))throw new Error('Link ưu đãi cần là link HTTPS của Shopee.');
 if(value.length>2000||/[\r\n]/.test(value))throw new Error('Link ưu đãi không hợp lệ.');return value;
}
export function imageSourceURL(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.port||url.username||url.password||value.length>2000||![url.hostname==='down-vn.img.susercontent.com',url.hostname==='down-vn.img.susercontent.net',url.hostname==='cf.shopee.vn',/^(?:down-[a-z]{2}|cf)\.img\.susercontent\.com$/.test(url.hostname)].some(Boolean))throw new Error('Link ảnh phải thuộc CDN ảnh Shopee được hỗ trợ.');
 return url.href;
}
export function vnNumber(value:string,percent=false):number|null{
 const raw=value.trim();if(!raw)return null;
 let text=raw.replace(/[₫đ%\s]/gi,'').toLowerCase(),factor=1;
 if(/(?:tr|[km])$/.test(text)){factor=text.endsWith('k')?1000:1000000;text=text.replace(/(?:tr|[km])$/,'').replace(',','.');}
 else if(text.includes(',')&&text.includes('.'))text=text.replace(/\./g,'').replace(',','.');
 else if(text.includes(','))text=text.replace(',','.');
 else if(!percent&&/^\d{1,3}(?:\.\d{3})+$/.test(text))text=text.replace(/\./g,'');
 if(!/^\d+(?:\.\d+)?$/.test(text))throw new Error('Giá hoặc tỉ lệ không đúng định dạng số.');
 const result=Number(text)*factor;
 if(!Number.isFinite(result)||result<0||result>(percent?100:99999999999999))throw new Error('Giá hoặc tỉ lệ ngoài phạm vi.');
 return percent?Math.round(result*100)/100:Math.round(result);
}
export function analyzeImport(files:ImportFile[]){
 if(!Array.isArray(files)||files.length<1||files.length>10||files.reduce((n,f)=>n+(typeof f?.text==='string'?f.text.length:2000001),0)>2000000)throw new Error('Chọn 1–10 file CSV, tổng tối đa 2 MB.');
 const lines:ImportLine[]=[],seen=new Map<string,ImportItem>();
 for(const file of files){
  if(typeof file.name!=='string'||file.name.length>240)throw new Error('Tên file không hợp lệ.');
  const rows=csvRows(file.text),columns=rows.shift()?.map(x=>x.normalize('NFC').trim())||[];
  for(const header of [headers.id,headers.name,headers.source,headers.affiliate])if(!columns.includes(header))throw new Error(`${file.name}: thiếu cột ${header}.`);
  if(new Set(columns).size!==columns.length)throw new Error(`${file.name}: tên cột bị lặp.`);
  rows.forEach((values,index)=>{
   if(lines.length>=IMPORT_LIMIT)throw new Error('Mỗi đợt tối đa 1.000 dòng.');
   const row=index+2,record=Object.fromEntries(columns.map((key,i)=>[key,(values[i]||'').trim()]));
   const line:ImportLine={file:file.name,row,name:record[headers.name]||'',productId:record[headers.id]||'',state:'new',message:''};
   try{
    if(values.length!==columns.length)throw new Error('Số ô không khớp số cột; kiểm tra dấu nháy CSV.');
    if(!/^\d{1,20}$/.test(line.productId))throw new Error('Mã sản phẩm phải là chuỗi chữ số.');
    const identity=shopeeIdentity(record[headers.source]);if(!identity||identity.itemId!==line.productId)throw new Error('Mã sản phẩm không khớp Link sản phẩm.');
    if(!line.name||line.name.length>240)throw new Error('Tên sản phẩm cần 1–240 ký tự.');
    const affiliate=shopeeAffiliateURL(record[headers.affiliate]),description=record['Mô tả']||record['Mô tả sản phẩm']||'';
    if(description.length>6000)throw new Error('Mô tả tối đa 6.000 ký tự.');
    const imageValue=record['Link ảnh']||record['Ảnh sản phẩm']||record['Image URL']||'';
    const image_urls=[...new Set(imageValue.split(/[|\n]/).map(s=>s.trim()).filter(Boolean).map(imageSourceURL))];
    if(image_urls.length>6)throw new Error('CSV nhận tối đa 6 link ảnh mỗi sản phẩm, phân cách bằng dấu |.');
    const item:ImportItem={key:line.productId,file:file.name,row,external_product_id:line.productId,external_shop_id:identity.shopId,name:line.name,affiliate_url:affiliate,source_url:identity.url,shop_name:(record[headers.shop]||'').slice(0,240),price:vnNumber(record[headers.price]||''),commission_rate:vnNumber(record[headers.rate]||'',true),description,image_urls,metadata:{price_raw:record[headers.price]||'',doanh_thu_raw:record['Doanh thu']||'',commission_raw:record['Hoa hồng']||''},warnings:[]};
    if(!description)item.warnings.push('Chưa có mô tả');if(!image_urls.length)item.warnings.push('Cần thử lấy ảnh từ trang sản phẩm');
    const old=seen.get(item.key);
    if(old){line.state='duplicate';line.message=`Trùng mã với ${old.file}, dòng ${old.row}; giữ dòng hợp lệ đầu tiên.`;if(old.affiliate_url!==item.affiliate_url||old.external_shop_id!==item.external_shop_id)line.message+=' Link/shop khác nhau: kiểm tra trước khi nhập.';}
    else {seen.set(item.key,item);line.item=item;line.message=item.warnings.join(' · ');}
   }catch(error){line.state='invalid';line.message=error instanceof Error?error.message:'Dòng không hợp lệ.';}
   lines.push(line);
  });
 }
 return {lines,items:[...seen.values()],total:lines.length,unique:seen.size};
}
export function productIdFromFilename(filename:string){const name=filename.replace(/\.[^.]+$/,'');return name.match(/^(\d{5,20})(?:[-_](?:\d{1,3}|[a-zA-Z][\w-]*))?$/)?.[1]||null;}
