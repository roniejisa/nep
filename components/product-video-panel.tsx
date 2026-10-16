'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase,formatBytes} from '@/lib/supabase';
import {VIDEO_BUCKET,MAX_VIDEO_BYTES,videoMetadata,type ProductVideo} from '@/lib/reel-rules';
import Pagination from '@/components/pagination';

async function request(productId:string,page:number,method='GET',body?:unknown){
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Vui lòng đăng nhập lại.');
 const response=await fetch(`/api/product-videos/?productId=${productId}&page=${page}`,{method,cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Không xử lý được video.');return result;
}
async function inspect(file:File){
 if(file.type!=='video/mp4'||!file.name.toLowerCase().endsWith('.mp4'))throw new Error('Chọn video MP4.');
 if(file.size<1||file.size>MAX_VIDEO_BYTES)throw new Error('Chọn video tối đa 50 MB.');
 const header=new Uint8Array(await file.slice(0,12).arrayBuffer());
 if(String.fromCharCode(...header.slice(4,8))!=='ftyp')throw new Error('File không có định dạng MP4 hợp lệ.');
 const url=URL.createObjectURL(file),element=document.createElement('video');
 try{return await new Promise<{duration:number;width:number;height:number}>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Không đọc được thông số video.')),15000);
  element.preload='metadata';element.onloadedmetadata=()=>{clearTimeout(timer);resolve({duration:element.duration,width:element.videoWidth,height:element.videoHeight});};element.onerror=()=>{clearTimeout(timer);reject(new Error('Trình duyệt không đọc được video. Xuất lại MP4 H.264/AAC.'));};element.src=url;
 });}finally{element.removeAttribute('src');element.load();URL.revokeObjectURL(url);}
}
export default function ProductVideoPanel({productId,value,onChange,onWorking,disabled=false}:{productId:string;value:string;onChange:(id:string)=>void;onWorking?:(working:boolean)=>void;disabled?:boolean}){
 const [videos,setVideos]=useState<ProductVideo[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[busy,setBusy]=useState(false),[approved,setApproved]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null),sequence=useRef(0);
 async function load(targetPage=page){const stamp=++sequence.current;const result=await request(productId,targetPage);if(stamp===sequence.current){setVideos(result.videos);setTotal(result.total||0);}}
 useEffect(()=>{setVideos([]);setTotal(0);setPage(1);setError('');setApproved(false);void load(1).catch(e=>setError(e.message));return()=>{sequence.current++;};},[productId]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[page]);
 async function upload(file?:File){
  if(!file||busy||disabled||!approved)return;setBusy(true);onWorking?.(true);setError('');setMessage('');
  let path='',registered=false,storageUploaded=false;
  try{
   const metadata=await inspect(file);videoMetadata({...metadata,size_bytes:file.size});
   const {data}=await supabase.auth.getUser();if(!data.user)throw new Error('Phiên đăng nhập không còn hợp lệ.');
   const id=crypto.randomUUID();path=`${data.user.id}/${productId}/${id}.mp4`;
   const {error:uploadError}=await supabase.storage.from(VIDEO_BUCKET).upload(path,file,{contentType:'video/mp4',upsert:false});if(uploadError)throw new Error('Chưa tải được video. Kiểm tra reels.sql và giới hạn Storage.');storageUploaded=true;
   // A lost registration response may still mean success; keep the file for review.
   registered=true;await request(productId,1,'POST',{id,product_id:productId,original_name:file.name.slice(0,240),size_bytes:file.size,...metadata,approved:true});
   onChange(id);setPage(1);await load(1);setMessage('Đã lưu video riêng tư, sẵn sàng cho Reel.');setApproved(false);
  }catch(e){setError((e instanceof Error?e.message:'Không tải được video.')+(registered?' Nếu phản hồi bị mất, làm mới danh sách trước khi tải lại.':''));if(path&&storageUploaded&&!registered)await supabase.storage.from(VIDEO_BUCKET).remove([path]);}
  finally{setBusy(false);onWorking?.(false);if(input.current)input.current.value='';}
 }
 async function remove(id:string){if(!window.confirm('Xóa video này khỏi kho? Bài đã đăng trên Meta vẫn còn.'))return;setBusy(true);onWorking?.(true);setError('');try{await request(productId,page,'DELETE',{id});if(value===id)onChange('');const next=Math.min(page,Math.max(1,Math.ceil((total-1)/6)));setPage(next);await load(next);}catch(e){setError(e instanceof Error?e.message:'Không xóa được video.');}finally{setBusy(false);onWorking?.(false);}}
 return <section className="product-video-panel"><h3>Video của sản phẩm</h3><p>Reel dùng một video thật đã chuẩn bị. MP4 dọc 9:16, 4–60 giây, tối thiểu 540 × 960, tối đa 50 MB. Nên xuất H.264/AAC, 30 fps. Không tự tạo video bằng AI.</p>
  <label className="verified-check"><input type="checkbox" checked={approved} disabled={busy||disabled} onChange={event=>setApproved(event.target.checked)}/><span>Tôi có quyền sử dụng video, video đúng sản phẩm và đồng ý cho dùng trong lịch tự đăng.</span></label>
  <input ref={input} type="file" accept="video/mp4,.mp4" disabled={busy||disabled||!approved} onChange={event=>void upload(event.target.files?.[0])} aria-label="Tải video MP4 cho sản phẩm"/>
  {busy&&<p role="status">Đang xử lý video…</p>}{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <button type="button" className="text-btn" disabled={busy||disabled} onClick={()=>void load().catch(e=>setError(e.message))}>Làm mới video</button>
  <div className="product-video-list">{videos.map(video=><article key={video.id}>
   {video.url&&<video src={video.url} controls preload="none" playsInline/>}
   <label className="verified-check"><input type="radio" name={`video-${productId}`} checked={value===video.id} disabled={busy||disabled||!video.approved} onChange={()=>onChange(video.id)}/><span>{video.original_name}<small>{Math.round(video.duration)} giây · {formatBytes(video.size_bytes)}{video.approved?' · đã xác nhận':' · chưa xác nhận'}</small></span></label>
   <button type="button" className="text-btn" disabled={busy||disabled} onClick={()=>void remove(video.id)}>Xóa video</button>
  </article>)}</div>
  {!videos.length&&!busy&&<p>Chưa có video trên trang này. Tải video để dùng Reel.</p>}
  <Pagination page={page} total={total} pageSize={6} disabled={busy||disabled} onChange={setPage} label="video sản phẩm"/>
 </section>;
}
