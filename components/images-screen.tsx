'use client';

import {useAdmin} from '@/components/admin-context';

import {EmptyArt,Spinner} from '@/components/admin-ui';

import {CheckCircle2,ImagePlus,Images,Leaf} from 'lucide-react';
import {formatBytes} from '@/lib/supabase';
import Pagination from '@/components/pagination';

export default function ImagesScreen(){const {loading,imagePage,setImagePage,imageQuery,setImageQuery,setPreview,openProduct,allImages,imageResults,view}=useAdmin();return <>        {view==='images' && <section className="catalog"><div className="catalog-title"><h2>Thư viện của bạn <span>{allImages.length}</span></h2><span className="webp-badge"><CheckCircle2 size={14}/> Chỉ WebP</span></div><div className="media-search"><input type="search" className="simple-search" aria-label="Tìm ảnh" placeholder="Tìm theo sản phẩm hoặc tên ảnh…" value={imageQuery} onChange={e=>setImageQuery(e.target.value)}/></div>{allImages.length>0&&imageResults.total===0&&<p className="empty-inline">Không có ảnh phù hợp với tìm kiếm.</p>}<div className="image-info"><Leaf size={19}/><p>Ảnh được nén trước khi tải lên, giữ nguyên tỷ lệ và không phóng lớn ảnh gốc. Chọn chế độ <strong>Nét hơn</strong> khi cần đọc chữ trên bao bì.</p></div>{loading?<div className="loading-state"><Spinner/> Đang tải ảnh sản phẩm…</div>:!allImages.length?<div className="empty-state"><EmptyArt/><h2>Những hình ảnh đẹp sẽ ở đây.</h2><p>Thêm ảnh từ trang sản phẩm. Nếp sẽ chuyển sang WebP và lưu riêng tư trên Supabase.</p><button className="btn primary" onClick={()=>openProduct()}><ImagePlus size={17}/> Thêm sản phẩm và ảnh</button></div>:<div className="media-grid">{imageResults.items.map(img=><article className="media-card" key={img.id}><button className="media-photo" onClick={()=>setPreview(img)}>{img.url?<img src={img.url} alt={img.productName} loading="lazy"/>:<Images/>}</button><div><button className="media-name" onClick={()=>openProduct(img.product)}>{img.productName}</button><span>{img.width} × {img.height} · {formatBytes(img.size_bytes)}</span><small>WEBP</small></div></article>)}</div>}<Pagination page={imagePage} total={imageResults.total} pageSize={24} onChange={setImagePage} label="ảnh sản phẩm"/></section>}
</>;}
