'use client';
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Send, Save, RefreshCw } from 'lucide-react';
import { supabase, type Product } from '@/lib/supabase';
type Post = { id:string;product_id:string|null;channel:'facebook'|'threads';body:string;review:string;status:string;external_id:string|null;target_id:string|null };
const labels:Record<string,string>={draft:'Bản nháp',publishing:'Đang gửi / cần xác minh',published:'Đã đăng',unknown:'Cần xác minh trên Meta'};
async function api(path:string,body?:unknown) {
 const {data}=await supabase.auth.getSession();
 if(!data.session) throw new Error('Vui lòng đăng nhập.');
 const response=await fetch(`/api/content/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await response.json();
 if(!response.ok) throw new Error(result.error || 'Yêu cầu thất bại.');
 return result;
}
export default function ContentStudio({products}:{products:Product[]}) {
 const [selected,setSelected]=useState('');
 const [posts,setPosts]=useState<Post[]>([]);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [approved,setApproved]=useState<Record<string,boolean>>({});
 const [config,setConfig]=useState({ai:false,facebook:false,threads:false});
 const [targets,setTargets]=useState({facebook:'',threads:''});
 const refresh=useCallback(async()=>{
  const result=await api('status');setPosts(result.posts);setConfig(result.configured);setTargets(result.targets);setApproved({});
 },[]);
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[refresh]);
 async function generate(){
  setBusy('generate');setError('');setNotice('');
  try{const result=await api('generate',{productId:selected});setPosts(old=>[...result.posts,...old]);setNotice(`Đã lưu hai bản nháp. Token sử dụng: ${result.tokens ?? 'chưa xác định'}. Hãy kiểm tra thông tin trước khi duyệt.`);}
  catch(e){setError(e instanceof Error?e.message:'Không tạo được bài.');}finally{setBusy('');}
 }
 async function submit(post:Post,action:'save'|'publish'){
  setBusy(post.id);setError('');setNotice('');
  try{
   const result=await api('publish',{postId:post.id,body:post.body,action,approved:approved[post.id]===true});
   setPosts(old=>old.map(p=>p.id===post.id?result.post:p));setApproved(old=>({...old,[post.id]:false}));
   setNotice(action==='save'?'Đã lưu bản chỉnh sửa.':`Đã đăng lên ${post.channel}. Mã bài: ${result.post.external_id}`);
  }catch(e){setError(e instanceof Error?e.message:'Không đăng được bài.');try{const result=await api('status');setPosts(old=>old.map(p=>{const latest=result.posts.find((item:Post)=>item.id===p.id);return latest&&latest.status!=='draft'?latest:p;}));}catch{/* preserve original error and edits */}}
  finally{setBusy('');}
 }
 return <section className="content-studio">
  <div className="setup-card"><h2>Từ sản phẩm đến bài đăng</h2><p>AI viết hai phiên bản, tự rà soát câu chữ và gắn link affiliate. Bạn đọc, sửa và duyệt từng bài trước khi gửi.</p>
   <div className="content-connections">{(['ai','facebook','threads'] as const).map(key=><span key={key}>{config[key]?'●':'○'} {key==='ai'?'AI':key==='facebook'?'Facebook Page':'Threads'}: {config[key]?'Đã điền cấu hình':'Thiếu cấu hình'}</span>)}</div>
   <small>Trạng thái trên chỉ kiểm tra biến môi trường, chưa xác nhận token còn hiệu lực.</small>
   <div className="content-controls"><label>Sản phẩm<select value={selected} disabled={!!busy} onChange={e=>setSelected(e.target.value)}><option value="">Chọn sản phẩm đã có mô tả</option>{products.filter(p=>p.status!=='archived').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <button className="btn primary" disabled={!selected||!!busy||!config.ai} onClick={()=>void generate()}><Sparkles size={17}/>{busy==='generate'?'Đang viết và rà soát…':'Tạo nội dung AI'}</button></div>
   <p className="content-muted">Tối đa 30 lượt/24 giờ · 2.200 token đầu ra/lượt · chờ AI tối đa 60 giây. AI không bảo đảm bài sẽ có nhiều tương tác. Bản này đăng chữ + link, chưa đính kèm ảnh hoặc lên lịch.</p>
  </div>
  {error&&<div className="error-banner" role="alert">{error}</div>}
  {notice&&<div className="connection-banner" role="status">{notice}</div>}
  <div className="content-heading"><h2>Bản nháp & lịch sử</h2><button className="btn secondary" disabled={!!busy} onClick={()=>{if(posts.some(p=>p.status==='draft')&&!window.confirm('Làm mới sẽ tải bản đã lưu. Bạn đã lưu các chỉnh sửa chưa?'))return;void refresh().catch(e=>setError(e.message));}}><RefreshCw size={16}/> Làm mới</button></div>
  {!posts.length&&<div className="setup-card"><p>Chọn một sản phẩm rồi nhấn “Tạo nội dung AI”. Bản nháp được lưu trong Supabase để bạn mở lại sau.</p><a href="/content.sql" download>Tải SQL cho tính năng nội dung</a></div>}
  <div className="content-grid">{posts.map(post=><article className="setup-card content-post" key={post.id}>
   <div className="content-heading"><h3>{post.channel==='facebook'?'Facebook Page':'Threads'}</h3><span>{labels[post.status]||post.status}</span></div>
   <p className="content-muted">{products.find(p=>p.id===post.product_id)?.name||'Sản phẩm'} · Đích: {post.target_id||targets[post.channel]||'chưa cấu hình'}</p>
   <textarea aria-label={`Nội dung ${post.channel}`} value={post.body} disabled={!!busy||post.status!=='draft'} onChange={e=>{const body=e.target.value;setPosts(old=>old.map(p=>p.id===post.id?{...p,body}:p));setApproved(old=>({...old,[post.id]:false}));}}/>
   <small>{Array.from(post.body).length} / {post.channel==='threads'?500:5000} ký tự, gồm link và thông báo affiliate.</small>
   <details><summary>Nhận xét AI về bản gốc</summary><p>{post.review}</p><small>Nhận xét này không cập nhật sau khi bạn sửa nội dung.</small></details>
   {post.status==='draft'?<><label className="content-approval"><input type="checkbox" checked={!!approved[post.id]} disabled={!!busy} onChange={e=>setApproved(old=>({...old,[post.id]:e.target.checked}))}/> Tôi đã kiểm tra nội dung, link và tài khoản đích; đồng ý đăng công khai bài này.</label><div className="button-row"><button className="btn secondary" disabled={!!busy} onClick={()=>void submit(post,'save')}><Save size={16}/> Lưu chỉnh sửa</button><button className="btn primary" disabled={!!busy||!approved[post.id]||!config[post.channel]} onClick={()=>void submit(post,'publish')}><Send size={16}/>{busy===post.id?'Đang xử lý…':'Duyệt & đăng'}</button></div></>:post.status==='published'?<p>Mã bài: <code>{post.external_id}</code></p>:<p role="status">Kiểm tra bài trực tiếp trên tài khoản đích trước khi xử lý tiếp. Hệ thống khóa gửi lại để tránh trùng bài.</p>}
  </article>)}</div>
 </section>;
}
