'use client';
import {pageWindow} from '@/lib/pagination';
export default function Pagination({page,total,pageSize,onChange,disabled=false,label='danh sách'}:{page:number;total:number;pageSize:number;onChange:(page:number)=>void;disabled?:boolean;label?:string}){
 const p=pageWindow(total,page,pageSize);if(!total)return null;
 const numbers=[...new Set([1,p.page-1,p.page,p.page+1,p.pages])].filter(n=>n>=1&&n<=p.pages).sort((a,b)=>a-b);
 return <nav className="pagination" aria-label={`Phân trang ${label}`}><span>{p.start+1}–{p.end} / {total}</span><div><button type="button" disabled={disabled||p.page<=1} onClick={()=>onChange(p.page-1)} aria-label="Trang trước">←</button>{numbers.map((n,i)=><span className="pagination-slot" key={n}>{i>0&&n-numbers[i-1]>1&&<span className="pagination-gap">…</span>}<button type="button" aria-label={`Trang ${n}`} aria-current={n===p.page?'page':undefined} disabled={disabled} onClick={()=>onChange(n)}>{n}</button></span>)}<button type="button" disabled={disabled||p.page>=p.pages} onClick={()=>onChange(p.page+1)} aria-label="Trang tiếp">→</button></div></nav>;
}
