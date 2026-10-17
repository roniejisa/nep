'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Upload,RefreshCw,ArrowLeft,ImagePlus,CheckCircle2} from 'lucide-react';
import {useAdmin} from '@/components/admin-context';
import {supabase} from '@/lib/supabase';
import {analyzeImport,productIdFromFilename,type ImportFile,type ImportLine} from '@/lib/product-import';
import {convertWebP} from '@/lib/webp';
import Pagination from '@/components/pagination';
async function api(body?:unknown,query=''){
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Vui lòng đăng nhập lại.');
 const response=await fetch('/api/product-import/'+query,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'}),value=await response.json();if(!response.ok)throw new Error(value.error||'Không xử lý được yêu cầu.');return value;
}
const states:Record<string,string>={new:'Sẽ nhập',existing:'Đã có',duplicate:'Trùng trong file',invalid:'Không hợp lệ',inserted:'Đã nhập',error:'Lỗi',conflict:'Cần kiểm tra',capacity:'Đầy kho',deferred:'Chưa xử lý',pending:'Đang chờ',running:'Đang lấy ảnh',done:'Hoàn tất',failed:'Cần bổ sung'};
export default function ProductImportScreen(){
 const {products,categories,loadProducts}=useAdmin();
 const [files,setFiles]=useState<ImportFile[]>([]),[lines,setLines]=useState<ImportLine[]>([]),[page,setPage]=useState(1),[filter,setFilter]=useState('all');
 const [category,setCategory]=useState('Khác'),[fetchImages,setFetchImages]=useState(true),[maxImages,setMaxImages]=useState(1),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[result,setResult]=useState<any>(null);
 const [jobs,setJobs]=useState<any[]>([]),[counts,setCounts]=useState<Record<string,number>>({}),[jobPage,setJobPage]=useState(1),[jobTotal,setJobTotal]=useState(0),[jobFilter,setJobFilter]=useState('all');
 const [photoFiles,setPhotoFiles]=useState<File[]>([]),[photoReport,setPhotoReport]=useState<string[]>([]);
 const [resultPage,setResultPage]=useState(1),[photoPage,setPhotoPage]=useState(1);
 const keepWorking=useRef(false),alive=useRef(true),jobSequence=useRef(0);
 const photoMatches=photoFiles.map(file=>{const code=productIdFromFilename(file.name),matches=products.filter(p=>p.external_product_id===code);return {file,code,product:matches.length===1?matches[0]:null};});
 async function refreshJobs(){const stamp=++jobSequence.current;const value=await api(undefined,`?page=${jobPage}&status=${jobFilter}`);if(alive.current&&stamp===jobSequence.current){setJobs(value.jobs||[]);setCounts(value.counts||{});setJobTotal(value.total||0);}return value;}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;keepWorking.current=false;jobSequence.current++;};},[]);
 useEffect(()=>{void refreshJobs().catch(e=>setError(e.message));const timer=setInterval(()=>void refreshJobs().catch(()=>{}),15000);return()=>{clearInterval(timer);jobSequence.current++;};},[jobPage,jobFilter]);
 useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 useEffect(()=>setJobPage(old=>Math.min(old,Math.max(1,Math.ceil(jobTotal/12)))),[jobTotal]);
 async function chooseFiles(list:FileList|null){
  if(!list)return;setBusy('preview');setError('');setResult(null);setConfirmed(false);setMessage('');
  try{
   const selected=Array.from(list);if(selected.length>10||selected.reduce((n,f)=>n+f.size,0)>2000000)throw new Error('Chọn tối đa 10 file, tổng dưới 2 MB.');
   const next:ImportFile[]=[];
   for(const file of selected){if(!/\.csv$/i.test(file.name))throw new Error('Chọn file CSV xuất từ Shopee.');const bytes=new Uint8Array(await file.arrayBuffer());const encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';next.push({name:file.name,text:new TextDecoder(encoding).decode(bytes)});}
   analyzeImport(next);const report=await api({action:'preview',files:next});setFiles(next);setLines(report.lines);setPage(1);setFilter('all');
   setMessage(`${report.total} dòng · ${report.unique} mã hợp lệ khác nhau · còn chỗ cho ${report.remainingCapacity} sản phẩm mới.`);
  }catch(e){setFiles([]);setLines([]);setError(e instanceof Error?e.message:'Không đọc được CSV.');}finally{setBusy('');}
 }
 async function commit(){
  setBusy('import');setError('');setResultPage(1);setMessage('Đang nhập vào kho. Có thể mất một lúc với nhiều sản phẩm…');
  try{const value=await api({action:'commit',files,category,fetchImages,maxImages,confirmed});setResult(value);setConfirmed(false);setMessage(`Đã thêm ${value.inserted} sản phẩm Nháp · ${value.existing} đã có · bỏ ${value.duplicates} dòng trùng và ${value.invalid.length} dòng lỗi.`);await loadProducts();await refreshJobs();}
  catch(e){setError((e instanceof Error?e.message:'Không xác nhận được kết quả nhập.')+' Nếu kết nối bị ngắt, chọn lại CSV để xem trước và nhập tiếp; mã đã có sẽ được bỏ qua.');}finally{setBusy('');}
 }
 async function processImages(){
  keepWorking.current=true;setBusy('images');setError('');
  try{while(keepWorking.current&&alive.current){const value=await api({action:'work'});if(!alive.current)break;const latest=await refreshJobs();if(!value.results?.length||!latest.counts?.pending)break;}if(alive.current){setMessage('Đã xử lý lượt ảnh. Xem hàng đợi để biết ảnh nào cần bổ sung.');await loadProducts();}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa xử lý được ảnh.');}finally{keepWorking.current=false;if(alive.current)setBusy('');}
 }
 async function retry(ids:string[]){setBusy('retry');setError('');try{const value=await api({action:'retry',productIds:ids});setMessage(`Đã xếp lại ${value.queued} sản phẩm để thử lấy ảnh.`);await refreshJobs();}catch(e){setError(e instanceof Error?e.message:'Không thử lại được.');}finally{setBusy('');}}
 async function uploadPhotos(){
  setBusy('photos');setError('');setPhotoReport([]);setPhotoPage(1);const report:string[]=[];
  try{
   const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Vui lòng đăng nhập.');
   for(const match of photoMatches){if(!match.product){report.push(`${match.file.name}: không tìm thấy duy nhất một mã sản phẩm.`);continue;}let preview='';
    try{const image=await convertWebP(match.file,'balanced');preview=image.preview;const form=new FormData();form.set('productId',match.product.id);form.set('file',image.blob,image.name);const response=await fetch('/api/product-import/upload/',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},body:form});const value=await response.json();if(!response.ok)throw new Error(value.error);report.push(`${match.file.name}: ${value.duplicate?'ảnh đã có, bỏ qua':'đã lưu WebP'}.`);}
    catch(e){report.push(`${match.file.name}: ${e instanceof Error?e.message:'lỗi'}`);}finally{if(preview)URL.revokeObjectURL(preview);}
    if(alive.current)setPhotoReport([...report]);else break;
   }
   if(alive.current){await loadProducts();await refreshJobs();setPhotoFiles([]);setMessage('Đã xử lý danh sách ảnh theo mã. Xem kết quả từng file bên dưới.');}
  }catch(e){setError(e instanceof Error?e.message:'Không tải được ảnh.');}finally{if(alive.current)setBusy('');}
 }
 const visible=lines.filter(line=>filter==='all'||line.state===filter),slice=visible.slice((page-1)*12,page*12),summary=Object.fromEntries(['new','existing','duplicate','invalid'].map(state=>[state,lines.filter(l=>l.state===state).length]));
 return <section className="bulk-import-page">
  <Link className="text-btn" href="/san-pham/"><ArrowLeft size={16}/> Về kho sản phẩm</Link>
  <header className="page-heading"><div><span className="eyebrow">KHO SẢN PHẨM</span><h1>Nhập nhiều sản phẩm</h1><p>Chọn CSV → kiểm tra mã → nhập Nháp → bổ sung ảnh và thông tin.</p></div></header>
  {error&&<div className="studio-alert error" role="alert">{error}</div>}{message&&<div className="studio-alert success" role="status">{message}</div>}
  <section className="setup-card bulk-section"><div className="section-heading"><Upload size={22}/><div><h2>1. Chọn các file CSV</h2><p>Nhận nhiều file cùng lúc. Sản phẩm trùng mã chỉ giữ dòng hợp lệ đầu tiên.</p></div></div>
   <label className="form-field">File xuất từ Shopee<input type="file" accept=".csv,text/csv" multiple disabled={!!busy} onChange={e=>{void chooseFiles(e.target.files);e.target.value='';}}/></label>
   {!!files.length&&<p className="small-note">{files.map(file=>file.name).join(' · ')}</p>}
   {!!lines.length&&<><div className="bulk-summary">{Object.entries(summary).map(([state,count])=><div key={state}><strong>{count}</strong><span>{states[state]}</span></div>)}</div>
   <label className="form-field">Xem dòng<select value={filter} disabled={!!busy} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">Tất cả</option>{Object.keys(summary).map(state=><option value={state} key={state}>{states[state]}</option>)}</select></label>
   <div className="table-scroll"><table><thead><tr><th>Mã sản phẩm</th><th>Tên & nguồn</th><th>Kết quả kiểm tra</th></tr></thead><tbody>{slice.map((line,i)=><tr key={`${line.file}:${line.row}:${i}`}><td><code>{line.productId||'—'}</code></td><td><strong>{line.name||'Thiếu tên'}</strong><small className="bulk-source">{line.file} · dòng {line.row}</small></td><td><strong>{states[line.state]}</strong><small className="bulk-source">{line.message}</small></td></tr>)}</tbody></table></div>
   <Pagination page={page} total={visible.length} pageSize={12} disabled={!!busy} onChange={setPage} label="dòng CSV"/>
   <div className="automation-grid"><label className="form-field">Danh mục nhập<input list="bulk-categories" maxLength={80} value={category} disabled={!!busy} onChange={e=>{setCategory(e.target.value);setConfirmed(false);}}/><datalist id="bulk-categories">{categories.map(name=><option value={name} key={name}/>)}</datalist></label><label className="form-field">Số ảnh tối đa mỗi sản phẩm<select value={maxImages} disabled={!!busy} onChange={e=>{setMaxImages(Number(e.target.value));setConfirmed(false);}}>{[1,3,6].map(count=><option key={count} value={count}>{count} ảnh</option>)}</select></label></div>
   <label className="verified-check"><input type="checkbox" checked={fetchImages} disabled={!!busy} onChange={e=>{setFetchImages(e.target.checked);setConfirmed(false);}}/><span>Thử lấy ảnh từ nguồn sau khi nhập. Chỉ bổ sung sản phẩm chưa có ảnh; giữ nguyên ảnh bạn đã chọn.</span></label>
   <p className="small-note">CSV không có ảnh: thử đọc ảnh công khai của trang Shopee. Nếu bị chặn, sản phẩm vẫn được lưu và hàng đợi báo lý do. Có thể thêm cột <code>Link ảnh</code> chứa URL CDN Shopee, nhiều ảnh phân cách bằng <code>|</code>. Không dùng AI để dựng ảnh thay cho ảnh thật.</p>
   <label className="verified-check"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={e=>setConfirmed(e.target.checked)}/><span>Tôi đồng ý nhập các dòng hợp lệ vào Nháp. Đây chưa phải duyệt nguồn hoặc cho phép tự đăng; sản phẩm đã có không bị ghi đè.</span></label>
   <button className="btn primary" disabled={!!busy||!confirmed||!category.trim()||!(summary.new||summary.existing)} onClick={()=>void commit()}><CheckCircle2 size={17}/>{busy==='import'?'Đang nhập…':'Nhập vào kho'}</button></>}
   {result&&<details className="settings-fold"><summary>Kết quả nhập từng mã</summary><div className="fold-content bulk-results">{result.results.slice((resultPage-1)*12,resultPage*12).map((item:any)=><p key={item.key}><code>{item.key}</code> · {states[item.state]||item.state} · {item.message}</p>)}</div><Pagination page={resultPage} total={result.results.length} pageSize={12} disabled={!!busy} onChange={setResultPage} label="kết quả nhập"/></details>}
  </section>
  <section className="setup-card bulk-section"><div className="section-heading"><ImagePlus size={22}/><div><h2>2. Hàng đợi lấy ảnh</h2><p>Ảnh được nén thành WebP, cạnh dài tối đa 1.600px, dưới 2 MB. Lỗi ảnh không tắt lịch đăng bài.</p></div></div>
   <div className="bulk-summary">{['pending','running','done','failed'].map(status=><div key={status}><strong>{counts[status]||0}</strong><span>{states[status]}</span></div>)}</div>
   <div className="button-row">{busy==='images'?<button className="btn secondary" onClick={()=>{keepWorking.current=false;setMessage('Sẽ dừng xử lý trong tab sau lượt hiện tại. Cron ảnh đã cài vẫn tiếp tục.');}}>Dừng sau lượt hiện tại</button>:<button className="btn primary" disabled={!!busy||!counts.pending} onClick={()=>void processImages()}>Chạy hàng đợi ảnh</button>}<button className="btn secondary" disabled={!!busy} onClick={()=>void refreshJobs().catch(e=>setError(e.message))}><RefreshCw size={16}/> Làm mới</button></div>
   <p className="small-note">Muốn đóng tab vẫn lấy ảnh: chạy <a href="/product-import-schedule.sql" download>product-import-schedule.sql</a> một lần sau <a href="/product-import.sql" download>product-import.sql</a>. Dùng lại CRON_SECRET/Vault hiện có; không cần bật lịch đăng bài.</p>
   <label className="form-field">Lọc hàng đợi<select value={jobFilter} disabled={!!busy} onChange={e=>{setJobFilter(e.target.value);setJobPage(1);}}><option value="all">Tất cả</option>{['pending','running','done','failed'].map(status=><option value={status} key={status}>{states[status]}</option>)}</select></label>
   <div className="bulk-jobs">{jobs.map(job=><article key={job.product_id}><div><strong>{job.product?.name||'Sản phẩm'}</strong><span>Mã {job.product?.external_product_id||'—'} · {states[job.status]} · lượt {job.attempts}</span><span>Cập nhật: {new Date(job.updated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</span>{job.error&&<p>{job.error}</p>}{job.status==='failed'&&!job.error&&<p>Chi tiết lỗi cũ đã được dọn. Có thể bổ sung ảnh hoặc thử lại.</p>}</div>{job.status==='failed'&&<button className="btn secondary small" disabled={!!busy} onClick={()=>void retry([job.product_id])}>Thử lại ảnh</button>}</article>)}</div>
   {!jobs.length&&<p>Chưa có sản phẩm trong bộ lọc hàng đợi này.</p>}<Pagination page={jobPage} total={jobTotal} pageSize={12} disabled={!!busy} onChange={setJobPage} label="sản phẩm lấy ảnh"/>
  </section>
  <details className="settings-fold"><summary>3. Bổ sung nhiều ảnh bằng tên file chứa mã sản phẩm</summary><div className="fold-content bulk-section"><p>Đặt tên như <code>16765092719.jpg</code>, <code>16765092719_1.png</code>, <code>16765092719_2.webp</code>. Hệ thống ghép đúng mã trong kho, nén WebP và bỏ ảnh có cùng nội dung đã nhập. Tối đa 12 ảnh/sản phẩm.</p>
   <label className="form-field">Chọn ảnh JPG/PNG/WebP<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length>200){setError('Chọn tối đa 200 ảnh mỗi đợt.');return;}setPhotoFiles(files);setPhotoReport([]);setPhotoPage(1);e.target.value='';}}/></label>
   {!!photoFiles.length&&<><p>{photoMatches.filter(m=>m.product).length}/{photoFiles.length} ảnh khớp mã trong kho.</p><div className="bulk-results">{photoMatches.slice((photoPage-1)*12,photoPage*12).map((match,i)=><p key={i}>{match.file.name} · {match.product?.name||'Không khớp duy nhất một sản phẩm'}</p>)}</div><Pagination page={photoPage} total={photoFiles.length} pageSize={12} disabled={!!busy} onChange={setPhotoPage} label="file ảnh"/><button className="btn primary" disabled={!!busy||!photoMatches.some(m=>m.product)} onClick={()=>void uploadPhotos()}>Nén & tải ảnh đã khớp</button></>}
   {!!photoReport.length&&<><div className="bulk-results" role="status">{photoReport.slice((photoPage-1)*12,photoPage*12).map((line,i)=><p key={i}>{line}</p>)}</div><Pagination page={photoPage} total={photoReport.length} pageSize={12} disabled={!!busy} onChange={setPhotoPage} label="kết quả ảnh"/></>}
  </div></details>
 </section>;
}
