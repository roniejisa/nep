'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {CheckCheck,RefreshCw,X} from 'lucide-react';
import {useAdmin} from '@/components/admin-context';
import {trapDialog,Spinner} from '@/components/admin-ui';
import Pagination from '@/components/pagination';
import {supabase} from '@/lib/supabase';
import {isPublishReady,readyIssues} from '@/lib/product-readiness';
import type {BulkAction,BulkResult} from '@/lib/product-bulk';
type Props={selected:Set<string>;setSelected:(value:Set<string>)=>void};
const actionNames:Record<BulkAction,string>={ready:'Chuyển Sẵn sàng',draft:'Chuyển về Nháp',archived:'Chuyển vào Lưu trữ',category:'Đổi danh mục'};
export default function ProductBulkActions({selected,setSelected}:Props){
 const {products,filtered,productResults,loading,dbError,categories,loadProducts}=useAdmin();
 const [dialog,setDialog]=useState<{action:BulkAction;ids:string[];scope:string}|null>(null),[fillFromFacts,setFillFromFacts]=useState(true),[confirmed,setConfirmed]=useState(false),[category,setCategory]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<BulkResult[]>([]),[resultPage,setResultPage]=useState(1),[previewPage,setPreviewPage]=useState(1);
 const focusRef=useRef<HTMLElement|null>(null),closeRef=useRef<HTMLButtonElement>(null);
 const readyCount=products.filter(isPublishReady).length,allCandidates=products.filter(p=>p.status!=='archived'&&!isPublishReady(p)),chosen=dialog?products.filter(p=>dialog.ids.includes(p.id)):[];
 const eligible=chosen.filter(p=>!readyIssues(p,fillFromFacts).length),missingDescriptions=chosen.filter(p=>!p.description.trim()).length,missingImages=chosen.filter(p=>!p.product_images.length).length;
 const pageIds=productResults.items.map(p=>p.id),allPageSelected=pageIds.length>0&&pageIds.every(id=>selected.has(id));
 useEffect(()=>{if(!dialog)return;focusRef.current=document.activeElement as HTMLElement;const previous=document.body.style.overflow;document.body.style.overflow='hidden';closeRef.current?.focus();return()=>{document.body.style.overflow=previous;focusRef.current?.focus();};},[!!dialog]);
 useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 function open(action:BulkAction,ids:string[],scope='sản phẩm đã chọn'){setDialog({action,ids:[...ids],scope});setConfirmed(false);setFillFromFacts(true);setCategory('');setError('');setPreviewPage(1);}
 function close(){if(!busy)setDialog(null);}
 async function apply(){
  if(!dialog||busy)return;setBusy(true);setError('');
  try{
   const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Phiên đăng nhập hết hạn. Đăng nhập lại rồi thử tiếp.');
   const response=await fetch('/api/products/bulk/',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({...dialog,category,confirmed,fillFromFacts}),cache:'no-store'});
   const value=await response.json();if(!response.ok)throw new Error(value.error||'Không cập nhật được sản phẩm.');
   setResults(value.results);setResultPage(1);setSelected(new Set(value.results.filter((r:BulkResult)=>!['updated','unchanged'].includes(r.state)).map((r:BulkResult)=>r.id)));setDialog(null);await loadProducts();
  }catch(e){setError((e instanceof Error?e.message:'Chưa xác nhận kết quả.')+' Nếu kết nối bị ngắt, làm mới kho trước khi thử lại.');}finally{setBusy(false);}
 }
 const updated=results.filter(r=>r.state==='updated').length,unchanged=results.filter(r=>r.state==='unchanged').length,needsAttention=results.length-updated-unchanged;
 return <>
  <section className="product-bulk-tools" aria-label="Duyệt sản phẩm hàng loạt">
   <div className="bulk-ready-overview"><div><strong>{readyCount}/{products.filter(p=>p.status!=='archived').length} sản phẩm đang dùng đã sẵn sàng cho bài thường</strong><p>Facebook, Threads có thể dùng bài chữ. Instagram cần ảnh; Reel cần video đã xác nhận.{products.some(p=>p.status==='archived')?` ${products.filter(p=>p.status==='archived').length} sản phẩm lưu trữ không nằm trong lượt duyệt tất cả.`:''}</p></div><div className="button-row"><button className="btn primary" disabled={loading||busy||!!dbError||!allCandidates.length} onClick={()=>open('ready',allCandidates.map(p=>p.id),'toàn bộ kho, trừ sản phẩm lưu trữ')}><CheckCheck size={16}/> Cho tất cả sẵn sàng{allCandidates.length>0?` (${allCandidates.length})`:''}</button><button className="btn secondary" disabled={loading||busy} onClick={()=>void loadProducts()} aria-label="Làm mới kho sản phẩm"><RefreshCw size={16}/> Làm mới</button></div></div>
   <div className="bulk-selection-row"><label><input type="checkbox" checked={allPageSelected} disabled={loading||busy||!pageIds.length} onChange={()=>{const next=new Set(selected);for(const id of pageIds)allPageSelected?next.delete(id):next.add(id);setSelected(next);}}/> Chọn trang này ({pageIds.length})</label><button className="text-btn" disabled={loading||busy||!filtered.length} onClick={()=>setSelected(new Set(filtered.map(p=>p.id)))}>Chọn tất cả {filtered.length} kết quả lọc</button><span aria-live="polite">Đã chọn {selected.size}{selected.size>0?' · giữ khi chuyển trang':''}{[...selected].some(id=>!filtered.some(p=>p.id===id))?' · có sản phẩm ngoài bộ lọc hiện tại':''}</span>{selected.size>0&&<button className="text-btn" disabled={busy} onClick={()=>setSelected(new Set())}>Bỏ chọn</button>}</div>
   {selected.size>0&&<div className="button-row bulk-selection-actions"><button className="btn primary" disabled={busy||loading||!!dbError} onClick={()=>open('ready',[...selected])}>Sẵn sàng ({selected.size})</button><button className="btn secondary" disabled={busy||loading||!!dbError} onClick={()=>open('category',[...selected])}>Đổi danh mục</button><button className="btn secondary" disabled={busy||loading||!!dbError} onClick={()=>open('draft',[...selected])}>Về Nháp</button><button className="btn secondary" disabled={busy||loading||!!dbError} onClick={()=>open('archived',[...selected])}>Lưu trữ</button></div>}
  </section>
  {!!results.length&&<section className="bulk-action-result" role="status"><strong>Đã cập nhật {updated} · Đã đúng yêu cầu {unchanged} · Cần xem lại {needsAttention}</strong><div className="button-row"><Link className="text-btn" href="/automation/">Kiểm tra lịch tự đăng →</Link><button className="text-btn" onClick={()=>setResults([])}>Ẩn kết quả</button></div><details className="settings-fold"><summary>Xem kết quả từng sản phẩm</summary><div className="fold-content bulk-result-lines">{results.slice((resultPage-1)*12,resultPage*12).map(r=><p key={r.id}><strong>{r.name}</strong><span>{r.message}</span></p>)}<Pagination page={resultPage} total={results.length} pageSize={12} onChange={setResultPage} label="kết quả"/></div></details></section>}
  {dialog&&<div className="modal-backdrop"><section className="small-dialog product-bulk-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-title" aria-busy={busy} onKeyDown={e=>trapDialog(e,close)}>
   <div className="bulk-dialog-heading"><h2 id="bulk-title">{actionNames[dialog.action]}</h2><button ref={closeRef} className="icon-btn" disabled={busy} onClick={close} aria-label="Đóng thao tác hàng loạt"><X size={20}/></button></div>
   <p>{dialog.ids.length} sản phẩm · {dialog.scope}. {dialog.action==='ready'?'Sau khi xác nhận, lịch đang bật có thể chọn các sản phẩm này ở lượt tiếp theo.':'Bài đã gửi hoặc đang gửi không bị hủy.'}</p>
   <fieldset disabled={busy} className="bulk-dialog-fields">
    {dialog.action==='ready'&&<><p><strong>{eligible.length} đủ điều kiện · {chosen.length-eligible.length} cần bổ sung</strong></p>{missingDescriptions>0&&<label className="verified-check"><input type="checkbox" checked={fillFromFacts} onChange={e=>{setFillFromFacts(e.target.checked);setConfirmed(false);}}/><span>Dùng tên, shop và quy cách hiện có làm thông tin nguồn cho {missingDescriptions} sản phẩm thiếu mô tả. Giữ nguyên mô tả đã nhập; không tạo thêm công dụng, thành phần hoặc trải nghiệm.</span></label>}<p className="small-note">{missingImages} sản phẩm chưa có ảnh: vẫn dùng được bài chữ Facebook/Threads; Instagram được bỏ qua. “Sẵn sàng” không bảo đảm token, kết nối hoặc lịch đăng đã cấu hình đúng.</p><details className="settings-fold"><summary>Xem sản phẩm và điều kiện còn thiếu</summary><div className="fold-content bulk-result-lines">{chosen.slice((previewPage-1)*12,previewPage*12).map(p=><p key={p.id}><strong>{p.name}</strong><span>{readyIssues(p,fillFromFacts).join(' · ')||(!p.description.trim()?'Sẽ dùng thông tin hiện có làm nguồn':'Đủ thông tin nguồn')}{!p.product_images.length?' · chưa có ảnh':''}</span></p>)}<Pagination page={previewPage} total={chosen.length} pageSize={12} onChange={setPreviewPage} label="sản phẩm"/></div></details><label className="verified-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Tôi xác nhận thông tin nguồn của nhóm sản phẩm này và cho phép dùng để tạo bài, tự đăng theo lịch đã cấu hình.</span></label></>}
    {dialog.action==='category'&&<label className="form-field">Danh mục mới<input list="bulk-move-categories" maxLength={80} value={category} onChange={e=>setCategory(e.target.value)} placeholder="Chọn hoặc nhập tên danh mục"/><datalist id="bulk-move-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label>}
    {(dialog.action==='draft'||dialog.action==='archived')&&<p>Những sản phẩm này sẽ không được chọn cho lượt tự đăng mới. Thông tin, ảnh, video và bài đã tạo vẫn được giữ.</p>}
   </fieldset>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <div className="button-row right"><button className="btn secondary" disabled={busy} onClick={close}>Đóng</button><button className="btn primary" disabled={busy||dialog.action==='ready'&&(!confirmed||!eligible.length)||dialog.action==='category'&&!category.trim()} onClick={()=>void apply()}>{busy?<Spinner/>:<CheckCheck size={16}/>} {busy?'Đang cập nhật…':dialog.action==='ready'?`Sẵn sàng ${eligible.length} sản phẩm`:actionNames[dialog.action]}</button></div>
  </section></div>}
 </>;
}
