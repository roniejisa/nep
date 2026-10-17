'use client';
import {usePathname,useRouter} from 'next/navigation';
import {adminPaths,adminView,type CoreView as View} from '@/lib/admin-routes';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';

import {supabase,BUCKET,categories as defaultCategories,readableError,operationError,safeHttpUrl,type Product,type ProductImage} from '@/lib/supabase';

import {VIDEO_BUCKET} from '@/lib/reel-rules';
import {paginate} from '@/lib/pagination';

import {defaultSettings,type SiteSettings} from '@/lib/site-settings';

import {convertWebP,type ConvertedImage,type ImagePreset} from '@/lib/webp';

type Draft = { id?: string; name: string; category: string; description: string; affiliate_url: string; source_url: string; shop_name: string; variant: string; price: string; commission_rate: string; status: Product['status']; notes: string; verified_at: string | null };
const emptyDraft = (): Draft => ({ name: '', category: 'Khác', description: '', affiliate_url: '', source_url: '', shop_name: '', variant: '', price: '', commission_rate: '', status: 'draft', notes: '', verified_at: null });
export function useAdminWorkspace(){
  const [site,setSite]=useState<SiteSettings>(defaultSettings);
  useEffect(()=>{fetch('/api/site-settings',{cache:'no-store'}).then(r=>r.json()).then(r=>{if(r.settings)setSite(r.settings);}).catch(()=>{});},[]);
  const router=useRouter(),pathname=usePathname();
  const view=adminView(pathname);
  const [connectionsOpen,setConnectionsOpen]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(['instagram_result','facebook_result','threads_result'].some(key=>params.has(key))){setConnectionsOpen(true);if(view!=='setup')router.replace('/cai-dat/?'+params.toString());}},[]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customCategories,setCustomCategories]=useState<string[]>([]);
  const categories=[...new Set([...(customCategories.length?customCategories:defaultCategories),...products.map(p=>p.category)])];
  useEffect(()=>{if(!user)return;void supabase.auth.getSession().then(async({data})=>{if(!data.session)return;const r=await fetch('/api/categories/',{headers:{Authorization:`Bearer ${data.session.access_token}`}});if(r.ok){const value=await r.json();setCustomCategories(value.categories);}}).catch(()=>{});},[user?.id,pathname]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [status, setStatus] = useState('all');
  const [mediaFilter,setMediaFilter]=useState('all');
  const [sort, setSort] = useState('newest');
  const [productPage,setProductPage]=useState(1),[imagePage,setImagePage]=useState(1),[imageQuery,setImageQuery]=useState('');
  useEffect(()=>setProductPage(1),[query,category,status,sort,mediaFilter]);
  useEffect(()=>setImagePage(1),[imageQuery]);
  const [display, setDisplay] = useState<'grid' | 'list'>('grid');
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [existingImages, setExistingImages] = useState<ProductImage[]>([]);
  const [pendingImages, setPendingImages] = useState<ConvertedImage[]>([]);
  const pendingRef = useRef<ConvertedImage[]>([]);
  const [imagePreset, setImagePreset] = useState<ImagePreset>('balanced');
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [formError, setFormError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<ProductImage | null>(null);
  const [sql, setSql] = useState('');
  const [sqlVisible, setSqlVisible] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const currentUser = useRef<string | undefined>(undefined);
  const notify = (message: string, error = false) => setNotice({ message, error });

  useEffect(() => { pendingRef.current = pendingImages; }, [pendingImages]);
  useEffect(() => () => { pendingRef.current.forEach(image => URL.revokeObjectURL(image.preview)); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), notice.error ? 10000 : 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => { if (error) setDbError(readableError(error)); setUser(data.session?.user ?? null); currentUser.current = data.session?.user.id; setAuthLoaded(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { currentUser.current = session?.user.id; setUser(session?.user ?? null); setAuthLoaded(true); if (!session) { setProducts([]); setTotalCount(0); } });
    return () => listener.subscription.unsubscribe();
  }, []);
  const loadProducts = useCallback(async () => {
    const uid = currentUser.current;
    if (!uid) return;
    setLoading(true); setDbError('');
    try {
      const { data, error, count } = await supabase.from('affiliate_products').select('*, product_images:affiliate_product_images(*)', { count: 'exact' }).order('updated_at', { ascending: false }).limit(1000);
      if (error) throw operationError('Đọc danh mục sản phẩm', error);
      const rows = (data ?? []) as Product[];
      if((count??0)>rows.length)throw new Error('Kho vượt giới hạn 1.000 sản phẩm của phiên bản này. Danh sách chưa được tải đầy đủ.');
      const all = rows.flatMap(product => product.product_images);
      if (all.length) {
        const urls=new Map<string,string>();
        for(let index=0;index<all.length;index+=100){const {data:signed,error:imageError}=await supabase.storage.from(BUCKET).createSignedUrls(all.slice(index,index+100).map(img=>img.storage_path),3600);if(imageError)throw new Error('Không tải được ảnh. Hãy làm mới sau.');for(const img of signed||[])if(img.path&&img.signedUrl)urls.set(img.path,img.signedUrl);}
        rows.forEach(product => product.product_images = product.product_images.map(img => ({ ...img, url: urls.get(img.storage_path) ?? undefined })).sort((a,b) => a.sort_order - b.sort_order));
      }
      if (currentUser.current !== uid) return;
      setProducts(rows); setTotalCount(count ?? rows.length);
    } catch (error) { if (currentUser.current === uid) setDbError(readableError(error)); }
    finally { if (currentUser.current === uid) setLoading(false); }
  }, []);
  useEffect(() => { if (!user) return; void loadProducts(); const timer = setInterval(() => void loadProducts(), 45 * 60 * 1000); return () => clearInterval(timer); }, [user?.id, loadProducts]);
  useEffect(()=>{setMobileNav(false);if(user&&(view==='products'||view==='images'||view==='content'))void loadProducts();},[pathname]);
  useEffect(() => { if (view !== 'setup') return; fetch('/setup.sql').then(r => { if (!r.ok) throw new Error(); return r.text(); }).then(setSql).catch(() => setSql('')); }, [view]);
  useEffect(() => {
    const open = !!editor || authOpen || !!deleteTarget || !!preview;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [editor, authOpen, deleteTarget, preview]);

  function navigate(next: View) { router.push(adminPaths[next]); setMobileNav(false); }
  function closeEditor() { if (saving || converting) return; pendingImages.forEach(img => URL.revokeObjectURL(img.preview)); setPendingImages([]); setEditor(null); setFormError(''); }
  function openProduct(product?: Product) {
    if (!user) { setAuthOpen(true); return; }
    setPendingImages([]); setFormError('');
    setEditor(product ? { id: product.id, name: product.name, category: product.category, description: product.description, affiliate_url: product.affiliate_url, source_url: product.source_url, shop_name: product.shop_name, variant: product.variant, status: product.status, notes: product.notes, verified_at: product.verified_at, price: product.price === null ? '' : String(product.price), commission_rate: product.commission_rate === null ? '' : String(product.commission_rate) } : emptyDraft());
    setExistingImages(product?.product_images ?? []);
  }
  async function copy(text: string, label = 'Đã sao chép') { try { await navigator.clipboard.writeText(text); notify(label); } catch { notify('Không thể sao chép. Bạn có thể chọn và sao chép nội dung trực tiếp.', true); } }
  async function addImages(files: FileList | File[] | null) {
    if (!files || converting || saving) return;
    const available = 12 - existingImages.length - pendingImages.length;
    const selected = Array.from(files);
    if (selected.length > available) { setFormError('Mỗi sản phẩm có tối đa 12 ảnh. Hãy chọn ít ảnh hơn.'); return; }
    setConverting(true); setFormError('');
    const converted: ConvertedImage[] = []; const failures: string[] = [];
    for (const file of selected) { try { converted.push(await convertWebP(file, imagePreset)); } catch (error) { failures.push(readableError(error)); } }
    setPendingImages(prev => [...prev, ...converted]); setConverting(false);
    if (failures.length) setFormError(failures.join(' '));
    if (fileInput.current) fileInput.current.value = '';
  }
  async function saveProduct(event: FormEvent) {
    event.preventDefault(); if (!editor || !user || saving || converting) return;
    const affiliate = safeHttpUrl(editor.affiliate_url.trim());
    if (!affiliate || !affiliate.startsWith('https:')) { setFormError('Link affiliate phải là đường dẫn HTTPS hợp lệ.'); return; }
    if (editor.source_url && !safeHttpUrl(editor.source_url)) { setFormError('Link nguồn chưa hợp lệ.'); return; }
    if (editor.status === 'ready' && !editor.description.trim()) { setFormError('Bổ sung mô tả gốc trước khi chuyển sang Sẵn sàng.'); return; }
    setSaving(true); setFormError('');
    const completed: string[] = [];
    let savedProductId = editor.id;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw operationError('Kiểm tra phiên đăng nhập', authError ?? new Error('Phiên đăng nhập không còn hợp lệ. Đăng nhập lại rồi thử lưu; thông tin trong form chưa bị xóa.'));
      if (authData.user.id !== user.id) throw operationError('Kiểm tra chủ sở hữu', new Error('Tài khoản đã thay đổi trong lúc chỉnh sửa. Đóng form và mở lại sản phẩm bằng tài khoản hiện tại.'));
      const ownerId = authData.user.id;
      // Update editable fields only. Never rewrite the existing record's ID or owner.
      const payload = { name: editor.name.trim(), category: editor.category.trim(), description: editor.description, affiliate_url: editor.affiliate_url.trim(), source_url: editor.source_url.trim(), shop_name: editor.shop_name, variant: editor.variant, price: editor.price === '' ? null : Number(editor.price), commission_rate: editor.commission_rate === '' ? null : Number(editor.commission_rate), status: editor.status, notes: editor.notes, verified_at: editor.verified_at };
      if (!payload.name) throw new Error('Vui lòng nhập tên sản phẩm.');
      const { data, error } = editor.id
        ? await supabase.from('affiliate_products').update(payload).eq('id', editor.id).eq('owner_id', ownerId).select().single()
        : await supabase.from('affiliate_products').insert({ ...payload, owner_id: ownerId }).select().single();
      if (error) throw operationError(editor.id ? 'Cập nhật bảng affiliate_products' : 'Tạo bản ghi affiliate_products', error);
      savedProductId = data.id;
      setEditor(prev => prev ? { ...prev, id: data.id } : null);
      for (const [index, img] of pendingImages.entries()) {
        const path = `${ownerId}/${data.id}/${img.id}.webp`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, img.blob, { contentType: 'image/webp', cacheControl: '3600', upsert: false });
        if (uploadError) throw operationError('Đã lưu sản phẩm; tải ảnh WebP lên Storage', uploadError);
        const { error: recordError } = await supabase.from('affiliate_product_images').insert({ product_id: data.id, owner_id: ownerId, storage_path: path, original_name: img.name, size_bytes: img.blob.size, original_bytes: img.originalBytes, width: img.width, height: img.height, sort_order: existingImages.length + index });
        if (recordError) { const { error: cleanup } = await supabase.storage.from(BUCKET).remove([path]); throw operationError(`Đã lưu sản phẩm; thêm bản ghi affiliate_product_images${cleanup ? ' (chưa dọn được file ảnh)' : ''}`, recordError); }
        completed.push(img.id);
      }
      pendingImages.forEach(img => URL.revokeObjectURL(img.preview)); setPendingImages([]); setEditor(null);
      notify('Đã lưu sản phẩm và hình ảnh vào Supabase.'); await loadProducts();
    } catch (error) {
      setFormError(readableError(error));
      if (completed.length) {
        setPendingImages(prev => prev.filter(img => { if (completed.includes(img.id)) { URL.revokeObjectURL(img.preview); return false; } return true; }));
        const { data: stored } = await supabase.from('affiliate_product_images').select('*').eq('product_id', savedProductId).order('sort_order');
        if (stored) { const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(stored.map(i => i.storage_path), 3600); setExistingImages(stored.map((i, index) => ({ ...i, url: urls?.[index]?.signedUrl }))); }
      }
      await loadProducts();
    } finally { setSaving(false); }
  }
  async function deleteImage(image: ProductImage) {
    if (saving || converting) return;
    setSaving(true); setFormError('');
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([image.storage_path]); if (error) throw error;
      const { error: rowError } = await supabase.from('affiliate_product_images').delete().eq('id', image.id); if (rowError) throw rowError;
      setExistingImages(prev => prev.filter(img => img.id !== image.id)); await loadProducts();
    } catch (error) { setFormError(readableError(error)); } finally { setSaving(false); }
  }
  async function setCover(image: ProductImage) {
    if (saving || converting) return; setSaving(true);
    try {
      const first = Math.min(0, ...existingImages.map(i => i.sort_order)) - 1;
      const { error } = await supabase.from('affiliate_product_images').update({ sort_order: first }).eq('id', image.id); if (error) throw error;
      setExistingImages(prev => prev.map(i => i.id === image.id ? { ...i, sort_order: first } : i).sort((a,b) => a.sort_order-b.sort_order)); await loadProducts();
    } catch (error) { setFormError(readableError(error)); } finally { setSaving(false); }
  }
  async function removeProduct() {
    if (!deleteTarget || deleting) return; setDeleting(true);
    try {
      const {count:activePosts,error:activeError}=await supabase.from('affiliate_content_posts').select('id',{head:true,count:'exact'}).eq('product_id',deleteTarget.id).in('status',['publishing','unknown']);
      if(activeError||activePosts)throw new Error('Không xóa sản phẩm có bài đang gửi/cần xác minh. Kiểm tra Meta trước.');
      const {data:videos,error:videoError}=await supabase.from('affiliate_product_videos').select('storage_path').eq('product_id',deleteTarget.id);
      if(videoError)throw new Error('Chưa đọc được video để dọn. Kiểm tra reels.sql.');
      for(let offset=0;offset<(videos?.length||0);offset+=100){const {error}=await supabase.storage.from(VIDEO_BUCKET).remove(videos!.slice(offset,offset+100).map(v=>v.storage_path));if(error)throw new Error('Chưa xóa được video sản phẩm.');}
      const paths = deleteTarget.product_images.map(img => img.storage_path);
      if (paths.length) { const { error } = await supabase.storage.from(BUCKET).remove(paths); if (error) throw error; }
      const { error } = await supabase.from('affiliate_products').delete().eq('id', deleteTarget.id); if (error) throw error;
      setDeleteTarget(null); notify('Đã xóa sản phẩm và ảnh khỏi Supabase.'); await loadProducts();
    } catch (error) { notify(readableError(error), true); } finally { setDeleting(false); }
  }
  async function importLinks() {
    if (!user) { setAuthOpen(true); return; } if (importing) return; setImporting(true);
    try {
      const {data:sessionData}=await supabase.auth.getSession();
      if(!sessionData.session)throw new Error('Vui lòng đăng nhập lại.');
      const response=await fetch('/api/admin/initial-links/',{headers:{Authorization:`Bearer ${sessionData.session.access_token}`},cache:'no-store'});
      if(!response.ok)throw new Error('Không có quyền đọc link khởi tạo.');
      const {links:initialLinks}:{links:string[]}=await response.json();
      const { data: current, error: checkError } = await supabase.from('affiliate_products').select('affiliate_url').in('affiliate_url', initialLinks);
      if (checkError) throw operationError('Kiểm tra link đã nhập', checkError);
      const already = new Set(current?.map(p => p.affiliate_url));
      const rows = initialLinks.flatMap((url, i) => already.has(url) ? [] : [{ owner_id: user.id, name: `SP0${i + 1} — cần bổ sung thông tin`, category: 'Khác', affiliate_url: url, status: 'draft', notes: 'Link gốc đã cung cấp. Chưa xác minh tên, mô tả, giá hoặc người bán.' }]);
      if (!rows.length) { notify('Cả 5 link đã có trong danh mục.'); return; }
      const { error } = await supabase.from('affiliate_products').insert(rows); if (error) throw operationError('Nhập 5 link vào affiliate_products', error);
      notify(`Đã nhập ${rows.length} link dưới dạng bản nháp. Chưa có thông tin sản phẩm được xác minh.`); await loadProducts();
    } catch (error) { notify(readableError(error), true); } finally { setImporting(false); }
  }
  async function logout() { const { error } = await supabase.auth.signOut(); if (error) notify(readableError(error), true); else { setProducts([]); setDbError(''); notify('Đã đăng xuất.'); } }
  function exportData() {
    const payload = products.map(({ product_images, ...p }) => ({ ...p, images: product_images.map(({ url, ...image }) => image) }));
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), products: payload }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `nep-products-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    notify('Đã xuất dữ liệu JSON. File ảnh vẫn được lưu riêng trong Supabase Storage.');
  }

  const allImages = products.flatMap(p => p.product_images.map(i => ({ ...i, productName: p.name, product: p })));
  const totalSize = allImages.reduce((sum, i) => sum + i.size_bytes, 0);
  const originals = allImages.reduce((sum, i) => sum + i.original_bytes, 0);
  const savingPercent = originals ? Math.max(0, Math.round((1-totalSize/originals)*100)) : 0;
  const filtered = products.filter(p => (category === 'Tất cả' || p.category === category) && (status === 'all' || p.status === status) && (mediaFilter==='all'||mediaFilter==='missing'&&!p.product_images.length||mediaFilter==='has'&&p.product_images.length>0||mediaFilter==='incomplete'&&(!p.description.trim()||!p.verified_at)) && `${p.name} ${p.shop_name} ${p.description} ${p.external_product_id||''} ${p.external_shop_id||''}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'vi') : sort === 'oldest' ? a.updated_at.localeCompare(b.updated_at) : b.updated_at.localeCompare(a.updated_at));
  const pendingBytes = pendingImages.reduce((sum,i) => sum+i.blob.size,0);
  const originalPending = pendingImages.reduce((sum,i) => sum+i.originalBytes,0);

  useEffect(()=>setProductPage(p=>Math.min(p,Math.max(1,Math.ceil(filtered.length/12)))),[filtered.length]);
  useEffect(()=>setImagePage(p=>Math.min(p,Math.max(1,Math.ceil(allImages.length/24)))),[allImages.length]);
  const productResults=paginate(filtered,productPage,12),imageResults=paginate(allImages.filter(img=>`${img.productName} ${img.original_name}`.toLocaleLowerCase('vi').includes(imageQuery.toLocaleLowerCase('vi'))),imagePage,24);
  return {site,setSite,connectionsOpen,setConnectionsOpen,user,setUser,authLoaded,setAuthLoaded,products,setProducts,customCategories,setCustomCategories,categories,loading,setLoading,dbError,setDbError,notice,setNotice,query,setQuery,category,setCategory,status,setStatus,mediaFilter,setMediaFilter,sort,setSort,productPage,setProductPage,imagePage,setImagePage,imageQuery,setImageQuery,display,setDisplay,authOpen,setAuthOpen,mobileNav,setMobileNav,editor,setEditor,existingImages,setExistingImages,pendingImages,setPendingImages,pendingRef,imagePreset,setImagePreset,converting,setConverting,saving,setSaving,importing,setImporting,formError,setFormError,dragging,setDragging,deleteTarget,setDeleteTarget,deleting,setDeleting,preview,setPreview,sql,setSql,sqlVisible,setSqlVisible,totalCount,setTotalCount,fileInput,currentUser,notify,loadProducts,navigate,closeEditor,openProduct,copy,addImages,saveProduct,deleteImage,setCover,removeProduct,importLinks,logout,exportData,allImages,totalSize,originals,savingPercent,filtered,pendingBytes,originalPending,productResults,imageResults,view};
}
export type AdminWorkspaceState=ReturnType<typeof useAdminWorkspace>;
