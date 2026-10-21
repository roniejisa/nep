export type ProductFacts={name:string;description:string;affiliate_url:string;shop_name?:string;variant?:string;status?:string;verified_at?:string|null};
export function validAffiliate(value:string){try{const url=new URL(value);return /^https:\/\//.test(value)&&value===value.trim()&&url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export function sourceDescription(product:ProductFacts){
 const name=product.name.trim();
 if(!name||/^SP\d+\s*[—-]\s*cần bổ sung/i.test(name))return '';
 return [`Tên sản phẩm theo dữ liệu nguồn: ${name}`,product.shop_name?.trim()?`Cửa hàng: ${product.shop_name.trim()}`:'',product.variant?.trim()?`Phân loại / quy cách: ${product.variant.trim()}`:''].filter(Boolean).join('\n');
}
export function readyIssues(product:ProductFacts,fillFromFacts=false){
 const issues:string[]=[];
 if(!product.name.trim())issues.push('Thiếu tên sản phẩm');
 if(!validAffiliate(product.affiliate_url))issues.push('Link affiliate HTTPS chưa hợp lệ');
 if(!product.description.trim()&&!(fillFromFacts&&sourceDescription(product)))issues.push('Thiếu thông tin nguồn cho AI');
 return issues;
}
export function isPublishReady(product:ProductFacts){return product.status==='ready'&&!!product.verified_at&&!readyIssues(product).length;}
export function readinessLabel(product:ProductFacts){
 const issues=readyIssues(product);
 if(issues.length)return issues.join(' · ');
 if(!product.verified_at)return 'Chưa xác nhận thông tin nguồn';
 return product.status==='ready'?'Đủ dữ liệu cho bài thường':product.status==='archived'?'Đang lưu trữ':'Chưa chuyển Sẵn sàng';
}
