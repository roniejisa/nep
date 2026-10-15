'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Copy, Database, ExternalLink, FileText, FolderOpen, Grid2X2, ImagePlus, Images, LayoutGrid, Leaf, Link2, List, Loader2, LockKeyhole, LogIn, LogOut, Menu, MoreHorizontal, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { supabase, BUCKET, SUPABASE_URL, categories as defaultCategories, initialLinks, readableError, operationError, safeHttpUrl, formatBytes, type Product, type ProductImage } from '@/lib/supabase';
import Pagination from '@/components/pagination';
import {paginate} from '@/lib/pagination';
import SiteSettingsEditor from '@/components/site-settings-editor';
import IntegrationGuide from '@/components/integration-guide';
import {defaultSettings,type SiteSettings} from '@/lib/site-settings';
import MetaPolicyLinks from '@/components/meta-policy-links';
import ContentStudio from '@/components/content-studio';
import { convertWebP, imagePresets, type ConvertedImage, type ImagePreset } from '@/lib/webp';

type View = 'products' | 'images' | 'setup' | 'content';
type Draft = { id?: string; name: string; category: string; description: string; affiliate_url: string; source_url: string; shop_name: string; variant: string; price: string; commission_rate: string; status: Product['status']; notes: string; verified_at: string | null };
const emptyDraft = (): Draft => ({ name: '', category: 'Khác', description: '', affiliate_url: '', source_url: '', shop_name: '', variant: '', price: '', commission_rate: '', status: 'draft', notes: '', verified_at: null });
const statusNames = { draft: 'Bản nháp', ready: 'Sẵn sàng', archived: 'Lưu trữ' };
const money = (n: number | null) => n === null ? 'Chưa có giá' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const date = (s: string) => new Date(s).toLocaleDateString('vi-VN');

function EmptyArt() { return <div className="empty-art" aria-hidden="true"><div className="art-dot dot-one"/><div className="art-dot dot-two"/><div className="art-card back-card"/><div className="art-card front-card"><div className="art-photo"><Package size={36} strokeWidth={1.35}/></div><i/><i className="short-line"/></div><span className="art-plus"><Plus size={22}/></span><span className="art-leaf"><Leaf size={21}/></span></div>; }
function trapDialog(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key !== 'Tab') return;
  const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function Spinner() { return <Loader2 size={17} className="spin"/>; }

export default function Home() {
  const [site,setSite]=useState<SiteSettings>(defaultSettings);
  useEffect(()=>{fetch('/api/site-settings',{cache:'no-store'}).then(r=>r.json()).then(r=>{if(r.settings)setSite(r.settings);}).catch(()=>{});},[]);
  const [view, setView] = useState<View>('products');
  const [connectionsOpen,setConnectionsOpen]=useState(false);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(['instagram_result','facebook_result','threads_result'].some(key=>params.has(key))){setView('setup');setConnectionsOpen(true);}},[]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customCategories,setCustomCategories]=useState<string[]>([]);
  const categories=[...new Set([...(customCategories.length?customCategories:defaultCategories),...products.map(p=>p.category)])];
  useEffect(()=>{if(!user)return;void supabase.auth.getSession().then(async({data})=>{if(!data.session)return;const r=await fetch('/api/categories/',{headers:{Authorization:`Bearer ${data.session.access_token}`}});if(r.ok){const value=await r.json();setCustomCategories(value.categories);}}).catch(()=>{});},[user?.id]);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState('');
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [productPage,setProductPage]=useState(1),[imagePage,setImagePage]=useState(1),[imageQuery,setImageQuery]=useState('');
  useEffect(()=>setProductPage(1),[query,category,status,sort]);
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
  useEffect(() => { if (view !== 'setup') return; fetch('/setup.sql').then(r => { if (!r.ok) throw new Error(); return r.text(); }).then(setSql).catch(() => setSql('')); }, [view]);
  useEffect(() => {
    const open = !!editor || authOpen || !!deleteTarget || !!preview;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [editor, authOpen, deleteTarget, preview]);

  function navigate(next: View) { setView(next); setMobileNav(false); }
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
      const paths = deleteTarget.product_images.map(img => img.storage_path);
      if (paths.length) { const { error } = await supabase.storage.from(BUCKET).remove(paths); if (error) throw error; }
      const { error } = await supabase.from('affiliate_products').delete().eq('id', deleteTarget.id); if (error) throw error;
      setDeleteTarget(null); notify('Đã xóa sản phẩm và ảnh khỏi Supabase.'); await loadProducts();
    } catch (error) { notify(readableError(error), true); } finally { setDeleting(false); }
  }
  async function importLinks() {
    if (!user) { setAuthOpen(true); return; } if (importing) return; setImporting(true);
    try {
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
  const filtered = products.filter(p => (category === 'Tất cả' || p.category === category) && (status === 'all' || p.status === status) && `${p.name} ${p.shop_name} ${p.description}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name, 'vi') : sort === 'oldest' ? a.updated_at.localeCompare(b.updated_at) : b.updated_at.localeCompare(a.updated_at));
  const pendingBytes = pendingImages.reduce((sum,i) => sum+i.blob.size,0);
  const originalPending = pendingImages.reduce((sum,i) => sum+i.originalBytes,0);

  useEffect(()=>setProductPage(p=>Math.min(p,Math.max(1,Math.ceil(filtered.length/12)))),[filtered.length]);
  useEffect(()=>setImagePage(p=>Math.min(p,Math.max(1,Math.ceil(allImages.length/24)))),[allImages.length]);
  const productResults=paginate(filtered,productPage,12),imageResults=paginate(allImages.filter(img=>`${img.productName} ${img.original_name}`.toLocaleLowerCase('vi').includes(imageQuery.toLocaleLowerCase('vi'))),imagePage,24);
  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="Đóng điều hướng" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <a className="brand" href="/" aria-label={`${site.name}, trang chủ`}><span className="brand-mark"><Leaf size={22}/></span><span>{site.name}<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">GÓC LÀM VIỆC CỦA BẠN</div>
      <nav aria-label="Điều hướng chính">
        <button className={`nav-item ${view==='products'?'active':''}`} onClick={() => navigate('products')}><LayoutGrid size={19}/> Sản phẩm <span className="nav-count">{user ? totalCount : '—'}</span></button>
        <button className={`nav-item ${view==='images'?'active':''}`} onClick={() => navigate('images')}><Images size={19}/> Thư viện ảnh</button>
        <button className={`nav-item ${view==='content'?'active':''}`} onClick={() => navigate('content')}><Sparkles size={19}/> Nội dung AI</button>
        <a className="nav-item" href="/automation/"><Sparkles size={19}/> Lịch tự đăng</a><a className="nav-item" href="/categories/"><FolderOpen size={19}/> Danh mục</a>
        <button className={`nav-item ${view==='setup'?'active':''}`} onClick={() => navigate('setup')}><Settings2 size={19}/> Kết nối & thiết lập</button>
      </nav>
      <div className="sidebar-note"><span className="tiny-label">ÍT DUNG LƯỢNG. NHIỀU Ý TƯỞNG.</span><div className="note-icon"><Leaf size={22}/></div><h3>Gọn nhẹ từ đầu.</h3><p>Ảnh tự chuyển sang WebP trước khi lưu. Dành chỗ cho những sản phẩm tiếp theo.</p><button onClick={() => navigate('images')}>Khám phá thư viện <ArrowRight size={15}/></button></div>
      <div className="sidebar-bottom"><span className="small-logo"><Database size={16}/></span><div><strong>Supabase</strong><span>{user ? 'Đã đăng nhập' : 'Chờ đăng nhập'}</span></div><span className={`status-dot ${user?'online':''}`}/></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-btn mobile-only" onClick={() => setMobileNav(true)} aria-label="Mở điều hướng"><Menu size={20}/></button><span>Không gian làm việc</span><ChevronRight size={14}/><strong>{view==='products'?'Sản phẩm':view==='images'?'Thư viện ảnh':view==='content'?'Nội dung AI':'Thiết lập'}</strong></div><div className="topbar-actions"><span className="private-label"><LockKeyhole size={13}/> Riêng tư</span><button className="account-button" onClick={() => user ? navigate('setup') : setAuthOpen(true)} title={user?.email || 'Đăng nhập'}>{user ? user.email?.slice(0,1).toUpperCase() : <LogIn size={17}/>}</button></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">AFFILIATE STUDIO</div><h1>{site.headings[view]}</h1><p>{site.descriptions[view]}</p></div>{view==='products' && <button className="btn primary" onClick={() => openProduct()}><Plus size={18}/> Thêm sản phẩm</button>}</div>
        {view !== 'setup' && !user && authLoaded && <div className="connection-banner"><span className="banner-icon"><ShieldCheck size={21}/></span><div><strong>Kết nối một lần. Lưu trữ dài lâu.</strong><p>Đăng nhập Supabase để lưu sản phẩm và ảnh trong tài khoản của bạn.</p></div><button className="text-btn" onClick={() => navigate('setup')}>Thiết lập ban đầu <ArrowUpRight size={16}/></button><button className="btn small white" onClick={() => setAuthOpen(true)}>Đăng nhập</button></div>}
        {dbError && <div className="error-banner" role="alert"><span>{dbError}</span><button className="text-btn" onClick={() => navigate('setup')}>Mở thiết lập</button><button className="text-btn" onClick={() => void loadProducts()}>Thử lại</button></div>}
        {view !== 'setup' && view !== 'content' && <section className="stats" aria-label="Thống kê danh mục"><div className="stat-card"><span className="stat-icon"><Package size={19}/></span><div><span>Tổng sản phẩm</span><strong>{user ? totalCount : '—'}</strong></div><small>{user ? `${products.filter(p=>p.status==='ready').length} sẵn sàng`:'Danh mục của bạn'}</small></div><div className="stat-card"><span className="stat-icon rose"><Images size={19}/></span><div><span>Ảnh sản phẩm</span><strong>{user ? allImages.length : '—'}</strong></div><small>Định dạng WebP</small></div><div className="stat-card"><span className="stat-icon amber"><Database size={19}/></span><div><span>Dung lượng ảnh</span><strong>{user ? formatBytes(totalSize) : '—'}</strong></div><small>{originals ? `Giảm ${savingPercent}% so với ảnh gốc`:'Tối ưu trước khi tải lên'}</small></div></section>}
        {totalCount>500 && <div className="connection-banner">Đang hiển thị 500 sản phẩm cập nhật gần nhất trong tổng số {totalCount}. Thống kê ảnh và xuất JSON áp dụng cho danh sách đang tải.</div>}
        {view==='products' && <>
          <section className="catalog"><div className="catalog-title"><h2>Danh mục sản phẩm <span>{user ? totalCount : 0}</span></h2><button className="text-btn subdued" onClick={exportData} disabled={!products.length}><ArrowDownToLine size={16}/> Xuất dữ liệu</button></div>
            <div className="toolbar"><label className="search-field"><Search size={18}/><input placeholder="Tìm tên sản phẩm, shop, mô tả…" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Tìm sản phẩm"/>{query && <button className="icon-btn" onClick={()=>setQuery('')} aria-label="Xóa tìm kiếm"><X size={14}/></button>}</label><div className="toolbar-right"><label className="select-field"><SlidersHorizontal size={15}/><select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Lọc trạng thái"><option value="all">Mọi trạng thái</option><option value="draft">Bản nháp</option><option value="ready">Sẵn sàng</option><option value="archived">Lưu trữ</option></select></label><label className="select-field sort-select"><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sắp xếp"><option value="newest">Mới cập nhật</option><option value="oldest">Cũ nhất</option><option value="name">Tên A–Z</option></select></label><div className="view-toggle"><button className={display==='grid'?'selected':''} onClick={()=>setDisplay('grid')} aria-label="Dạng thẻ" aria-pressed={display==='grid'}><Grid2X2 size={17}/></button><button className={display==='list'?'selected':''} onClick={()=>setDisplay('list')} aria-label="Dạng danh sách" aria-pressed={display==='list'}><List size={19}/></button></div></div></div>
            <div className="button-row" style={{padding:"12px 24px"}}><a className="text-btn" href="/categories/">Tạo & quản lý danh mục →</a></div><div className="catalog-category-filter"><label>Danh mục<select value={category} onChange={e=>setCategory(e.target.value)}>{['Tất cả',...categories].map(c=><option key={c}>{c}</option>)}</select></label></div>
            {loading ? <div className="loading-state"><Spinner/> Đang tải dữ liệu của bạn…</div> : !filtered.length ? <div className="empty-state"><EmptyArt/><h2>{products.length ? 'Chưa tìm thấy sản phẩm phù hợp.' : 'Sản phẩm đầu tiên, khởi đầu mới.'}</h2><p>{products.length ? 'Thử một từ khóa hoặc nhóm sản phẩm khác.' : 'Thêm tên, link affiliate và vài tấm ảnh.\nMột danh mục gọn gàng bắt đầu từ những điều nhỏ.'}</p>{products.length ? <button className="btn secondary" onClick={()=>{setQuery('');setCategory('Tất cả');setStatus('all');}}>Xóa bộ lọc</button> : <div className="empty-actions"><button className="btn primary" onClick={()=>openProduct()}><Plus size={17}/> Thêm sản phẩm đầu tiên</button><button className="text-btn" disabled={importing} onClick={()=>void importLinks()}>{importing ? <Spinner/>:<Link2 size={15}/>} Nhập 5 link Shopee đã gửi</button></div>}<div className="empty-footnote"><ShieldCheck size={14}/> Dữ liệu thực của bạn. Không có sản phẩm mẫu.</div></div> : display==='grid' ? <div className="product-grid">{productResults.items.map(product=><article className="product-card" key={product.id}><button className="product-photo" onClick={()=>openProduct(product)} aria-label={`Chỉnh sửa ${product.name}`}>{product.product_images[0]?.url ? <img src={product.product_images[0].url} alt={product.name} loading="lazy"/> : <div className="photo-placeholder"><Package size={38} strokeWidth={1.25}/><span>Chưa có ảnh</span></div>}<span className={`status-chip ${product.status}`}>{statusNames[product.status]}</span>{product.product_images.length>0 && <span className="photo-count"><Images size={12}/>{product.product_images.length}</span>}</button><div className="product-card-body"><span className="product-category">{product.category}</span><button className="product-name" onClick={()=>openProduct(product)}>{product.name}</button><p>{product.variant || product.shop_name || 'Chưa bổ sung quy cách'}</p><div className="product-price">{money(product.price)}{product.commission_rate!==null && <small>HH {product.commission_rate}%</small>}</div><div className="product-card-footer"><span>{date(product.updated_at)}</span><button className="icon-btn" onClick={()=>void copy(product.affiliate_url,'Đã sao chép link affiliate gốc.')} aria-label={`Sao chép link ${product.name}`}><Link2 size={16}/></button><button className="icon-btn danger-hover" onClick={()=>setDeleteTarget(product)} aria-label={`Xóa ${product.name}`}><Trash2 size={15}/></button></div></div></article>)}</div> : <div className="table-scroll"><table><thead><tr><th>Sản phẩm</th><th>Nhóm</th><th>Giá tham khảo</th><th>Trạng thái</th><th>Cập nhật</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{productResults.items.map(product=><tr key={product.id}><td><button className="table-product" onClick={()=>openProduct(product)}><span className="table-thumb">{product.product_images[0]?.url?<img src={product.product_images[0].url} alt=""/>:<Package size={20}/>}</span><span><strong>{product.name}</strong><small>{product.variant||product.shop_name||'Chưa bổ sung quy cách'}</small></span></button></td><td>{product.category}</td><td>{money(product.price)}</td><td><span className={`status-chip static ${product.status}`}>{statusNames[product.status]}</span></td><td>{date(product.updated_at)}</td><td><button className="icon-btn" onClick={()=>void copy(product.affiliate_url)} aria-label="Sao chép link"><Link2 size={16}/></button><button className="icon-btn danger-hover" onClick={()=>setDeleteTarget(product)} aria-label="Xóa sản phẩm"><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>}
            <Pagination page={productPage} total={filtered.length} pageSize={12} onChange={setProductPage} label="sản phẩm"/><div className="catalog-footer"><span>{filtered.length} sản phẩm{category!=='Tất cả'?` trong ${category.toLowerCase()}`:''}</span><span><span className="status-dot online"/> Ảnh được tối ưu ngay trên thiết bị</span></div>
          </section>
          <div className="bottom-tip"><span><Sparkles size={17}/> Một danh mục tốt là nền tảng cho nội dung hay.</span><button className="text-btn subdued" onClick={()=>navigate('setup')}>Tìm hiểu cách lưu dữ liệu <ArrowRight size={14}/></button></div>
        </>}
        {view==='content' && user && <><div className="button-row" style={{marginBottom:20}}><a className="btn primary" href="/automation/">Lịch đăng tự động →</a></div><ContentStudio key={user.id} products={products} onProductsChanged={loadProducts}/></>}
        {view==='images' && <section className="catalog"><div className="catalog-title"><h2>Thư viện của bạn <span>{allImages.length}</span></h2><span className="webp-badge"><CheckCircle2 size={14}/> Chỉ WebP</span></div><div className="media-search"><input type="search" className="simple-search" aria-label="Tìm ảnh" placeholder="Tìm theo sản phẩm hoặc tên ảnh…" value={imageQuery} onChange={e=>setImageQuery(e.target.value)}/></div>{allImages.length>0&&imageResults.total===0&&<p className="empty-inline">Không có ảnh phù hợp với tìm kiếm.</p>}<div className="image-info"><Leaf size={19}/><p>Ảnh được nén trước khi tải lên, giữ nguyên tỷ lệ và không phóng lớn ảnh gốc. Chọn chế độ <strong>Nét hơn</strong> khi cần đọc chữ trên bao bì.</p></div>{!allImages.length?<div className="empty-state"><EmptyArt/><h2>Những hình ảnh đẹp sẽ ở đây.</h2><p>Thêm ảnh từ trang sản phẩm. Nếp sẽ chuyển sang WebP và lưu riêng tư trên Supabase.</p><button className="btn primary" onClick={()=>openProduct()}><ImagePlus size={17}/> Thêm sản phẩm và ảnh</button></div>:<div className="media-grid">{imageResults.items.map(img=><article className="media-card" key={img.id}><button className="media-photo" onClick={()=>setPreview(img)}>{img.url?<img src={img.url} alt={img.productName} loading="lazy"/>:<Images/>}</button><div><button className="media-name" onClick={()=>openProduct(img.product)}>{img.productName}</button><span>{img.width} × {img.height} · {formatBytes(img.size_bytes)}</span><small>WEBP</small></div></article>)}</div>}<Pagination page={imagePage} total={imageResults.total} pageSize={24} onChange={setImagePage} label="ảnh sản phẩm"/></section>}
        {view==='setup' && <div className="setup-layout"><div className="setup-main">{user&&<><a className="btn primary" href="/automation/">Lịch đăng tự động →</a><details className="settings-fold" name="setup-options" open={connectionsOpen} onToggle={e=>setConnectionsOpen(e.currentTarget.open)}><summary>Kết nối Facebook, Threads, Instagram & AI</summary><div className="fold-content"><IntegrationGuide userId={user.id}/></div></details><details className="settings-fold" name="setup-options"><summary>Chỉnh thông tin & nội dung website</summary><SiteSettingsEditor onSaved={setSite}/></details></>}<MetaPolicyLinks/><details className="settings-fold" name="setup-options"><summary>Cài đặt dữ liệu ban đầu · chỉ cần một lần</summary><div className="fold-content setup-main"><section className="setup-card"><div className="section-heading"><span className="step-number">1</span><div><h2>Kết nối dự án Supabase</h2><p>URL và publishable key đã được cấu hình cho web này.</p></div><CheckCircle2 className="green" size={21}/></div><label className="field-label">PROJECT URL</label><div className="readonly-field">{SUPABASE_URL}<button className="icon-btn" onClick={()=>void copy(SUPABASE_URL)} aria-label="Sao chép URL"><Copy size={16}/></button></div><div className="inline-note"><LockKeyhole size={14}/> Publishable key dùng ở trình duyệt. Quyền truy cập được kiểm soát bằng RLS.</div></section>
          <section className="setup-card"><div className="section-heading"><span className="step-number">2</span><div><h2>Khởi tạo dữ liệu một lần</h2><p>Tạo bảng sản phẩm, bảng ảnh và bucket WebP riêng tư.</p></div></div><p className="setup-copy">Mở SQL Editor của dự án, tạo một query mới, dán script rồi bấm Run. Script chỉ cấu hình các bảng có tiền tố <code>affiliate_</code> và bucket <code>affiliate-product-images</code>.</p><div className="button-row"><button className="btn primary" onClick={()=>void copy(sql,'Đã sao chép script SQL.')} disabled={!sql}><Copy size={16}/> Sao chép SQL</button><a className="btn secondary" href="https://supabase.com/dashboard/project/aegbygaxnynjfkmogpbg/sql/new" target="_blank" rel="noreferrer">Mở SQL Editor <ArrowUpRight size={16}/></a><a className="text-btn" href="/setup.sql" download="nep-supabase-setup.sql"><ArrowDownToLine size={15}/> Tải SQL</a></div><button className="text-btn subdued sql-toggle" onClick={()=>setSqlVisible(!sqlVisible)}><ChevronDown size={15} style={{transform:sqlVisible?'rotate(180deg)':undefined}}/>{sqlVisible?'Ẩn':'Xem'} nội dung script</button>{sqlVisible&&<pre className="sql-code">{sql||'Đang tải script…'}</pre>}</section>
          <section className="setup-card"><div className="section-heading"><span className="step-number">3</span><div><h2>Tạo tài khoản quản trị và đăng nhập</h2><p>Mỗi tài khoản chỉ truy cập sản phẩm và ảnh do chính mình tạo.</p></div>{user&&<CheckCircle2 className="green" size={21}/>}</div><p className="setup-copy">Trong Supabase, vào <strong>Authentication → Users → Add user → Create new user</strong>, nhập email và mật khẩu của bạn, chọn xác nhận email nếu phù hợp. Sau đó quay lại đây đăng nhập. Web không mở đăng ký công khai.</p><div className="button-row"><a className="btn secondary" href="https://supabase.com/dashboard/project/aegbygaxnynjfkmogpbg/auth/users" target="_blank" rel="noreferrer">Mở Authentication <ArrowUpRight size={16}/></a>{user?<button className="btn primary" onClick={()=>void loadProducts().then(()=>navigate('products'))}>Kiểm tra dữ liệu <ArrowRight size={16}/></button>:<button className="btn primary" onClick={()=>setAuthOpen(true)}><LogIn size={16}/> Đăng nhập</button>}</div>{user&&<div className="signed-in-box"><CheckCircle2 size={17}/><span>{user.email}</span><button className="text-btn" onClick={()=>void logout()}><LogOut size={15}/> Đăng xuất</button></div>}</section></div></details></div>
          <aside className="setup-aside"><div className="setup-aside-icon"><ShieldCheck size={29}/></div><h3>Dữ liệu là của bạn.</h3><p>Sản phẩm nằm trong PostgreSQL. Ảnh nằm trong Storage của dự án Supabase bạn cung cấp.</p><ul><li><Check size={15}/> Bucket ảnh riêng tư</li><li><Check size={15}/> Chỉ chấp nhận image/webp</li><li><Check size={15}/> Tối đa 2 MB mỗi ảnh</li><li><Check size={15}/> Phân quyền theo tài khoản</li><li><Check size={15}/> Giữ nguyên link affiliate</li></ul><div className="aside-divider"/><h4>Không gian quản trị</h4><p>Quản lý sản phẩm, nội dung và lịch tự đăng. Mở từng nhóm cài đặt khi cần thay đổi.</p><span className="version-label">NẾP STUDIO · PHIÊN BẢN 2.7.1</span></aside></div>}
        <nav className="legal-footer-links" aria-label="Chính sách"><a href="/privacy-policy/">Quyền riêng tư</a><a href="/terms-of-service/">Điều khoản</a><a href="/data-deletion/">Xóa dữ liệu</a><a href="/contact/">Liên hệ</a></nav>
        <footer className="page-footer"><span>{site.name}. <span>{site.tagline}</span></span><span>{site.footer}</span></footer>
      </div>
    </main>
    {notice&&<div className={`toast ${notice.error?'error':''}`} role="status">{notice.error?<CircleHelp size={20}/>:<CheckCircle2 size={20}/>}<span>{notice.message}</span><button className="icon-btn" onClick={()=>setNotice(null)} aria-label="Đóng thông báo"><X size={16}/></button></div>}
    {authOpen&&<AuthModal onClose={()=>setAuthOpen(false)} onSuccess={()=>{setAuthOpen(false);notify('Đã đăng nhập Supabase.');}}/>}
    {editor&&<div className="modal-backdrop"><section className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title" onKeyDown={e=>trapDialog(e,closeEditor)}><div className="editor-header"><div><span className="eyebrow">HỒ SƠ SẢN PHẨM</span><h2 id="editor-title">{editor.id?'Chỉnh sửa sản phẩm':'Thêm một sản phẩm mới'}</h2></div><button className="icon-btn" disabled={saving||converting} onClick={closeEditor} aria-label="Đóng form"><X size={23}/></button></div><form onSubmit={saveProduct} className="editor-form"><div className="editor-scroll"><fieldset className="editor-fields" disabled={saving}><div className="editor-columns"><div className="form-main"><h3><Package size={18}/> Thông tin sản phẩm</h3><label className="form-field">Tên sản phẩm <span>*</span><input autoFocus required maxLength={240} value={editor.name} placeholder="VD: Nước giặt túi 2 lít" onChange={e=>setEditor({...editor,name:e.target.value})}/></label><div className="field-row"><label className="form-field">Nhóm sản phẩm<input list="product-category-options" maxLength={80} required value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})} placeholder="Chọn hoặc nhập tên danh mục mới"/><datalist id="product-category-options">{categories.map(c=><option key={c} value={c}/>)}</datalist></label><label className="form-field">Phân loại / quy cách<input value={editor.variant} placeholder="VD: Túi 2 lít · hương hoa" onChange={e=>setEditor({...editor,variant:e.target.value})}/></label></div><label className="form-field">Link affiliate <span>*</span><div className="input-icon"><Link2 size={16}/><input type="url" required value={editor.affiliate_url} placeholder="https://s.shopee.vn/…" onChange={e=>setEditor({...editor,affiliate_url:e.target.value})}/></div><small>Giữ nguyên link gốc của bạn, không thay đổi mã tiếp thị.</small></label><label className="form-field">Mô tả gốc<textarea rows={6} value={editor.description} placeholder="Thông tin, thành phần, công dụng và hướng dẫn do nhà sản xuất hoặc shop cung cấp…" onChange={e=>setEditor({...editor,description:e.target.value})}/><small>Nội dung nguồn được lưu riêng, chưa phải bài quảng bá do AI viết.</small></label><details className="settings-fold product-optional"><summary>Thông tin bổ sung · shop, giá, ghi chú</summary><div className="fold-content"><div className="field-row"><label className="form-field">Tên shop<input value={editor.shop_name} onChange={e=>setEditor({...editor,shop_name:e.target.value})} placeholder="Tên nhà bán hàng"/></label><label className="form-field">Link nguồn<input type="url" value={editor.source_url} onChange={e=>setEditor({...editor,source_url:e.target.value})} placeholder="Link sản phẩm hoặc hãng"/></label></div><div className="field-row"><label className="form-field">Giá tham khảo (VNĐ)<input type="number" min="0" max="99999999999999" step="1" value={editor.price} onChange={e=>setEditor({...editor,price:e.target.value})} placeholder="Chưa có thông tin"/></label><label className="form-field">Hoa hồng (%)<input type="number" min="0" max="100" step="0.01" value={editor.commission_rate} onChange={e=>setEditor({...editor,commission_rate:e.target.value})} placeholder="Chưa có thông tin"/></label></div><label className="form-field">Ghi chú nội bộ<textarea rows={2} value={editor.notes} onChange={e=>setEditor({...editor,notes:e.target.value})} placeholder="Điểm cần xác minh hoặc lưu ý cho nội dung…"/></label></div></details><div className="field-row"><label className="form-field">Trạng thái<select value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value as Product['status']})}><option value="draft">Bản nháp</option><option value="ready">Sẵn sàng</option><option value="archived">Lưu trữ</option></select></label><label className="verified-check"><input type="checkbox" checked={!!editor.verified_at} onChange={e=>setEditor({...editor,verified_at:e.target.checked?new Date().toISOString():null})}/><span>Tôi đã kiểm tra thông tin nguồn{editor.verified_at&&<small>{date(editor.verified_at)}</small>}</span></label></div></div>
          <div className="form-images"><div className="images-heading"><h3><Images size={18}/> Hình ảnh</h3><span>{existingImages.length+pendingImages.length}/12</span></div><div className="preset-options">{(Object.keys(imagePresets) as ImagePreset[]).map(p=><button type="button" className={imagePreset===p?'active':''} key={p} disabled={converting||saving} onClick={()=>setImagePreset(p)}>{imagePresets[p].label}</button>)}</div><p className="preset-help">{imagePresets[imagePreset].detail} · áp dụng cho ảnh thêm mới</p><div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void addImages(e.dataTransfer.files);}}><span className="drop-icon">{converting?<Spinner/>:<ImagePlus size={26}/>}</span><strong>{converting?'Đang tối ưu ảnh…':'Kéo ảnh vào đây'}</strong><span>hoặc chọn ảnh từ thiết bị</span><button type="button" className="btn secondary small" disabled={converting||saving||existingImages.length+pendingImages.length>=12} onClick={()=>fileInput.current?.click()}><Upload size={15}/> Chọn ảnh</button><small>JPG, PNG, WebP · tối đa 20 MB ảnh gốc</small><input className="sr-only" ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>void addImages(e.target.files)} aria-label="Chọn ảnh sản phẩm"/></div><div className="webp-info"><Leaf size={16}/><span>Luôn lưu dưới dạng <strong>WebP</strong>. Không tải ảnh gốc lên máy chủ.</span></div>{pendingImages.length>0&&<div className="compression-summary"><span>Sau tối ưu <strong>{formatBytes(pendingBytes)}</strong></span><small>{formatBytes(originalPending)} gốc · {pendingBytes<originalPending?`giảm ${Math.round((1-pendingBytes/originalPending)*100)}%`:'ưu tiên giữ độ nét'}</small></div>}<div className="edit-image-grid">{existingImages.map((img,index)=><div className="edit-image" key={img.id}><div className="edit-image-photo">{img.url?<img src={img.url} alt={img.original_name}/>:<Images/>}<button type="button" className="image-remove" disabled={saving||converting} onClick={()=>void deleteImage(img)} aria-label={`Xóa ảnh ${img.original_name}`}><X size={14}/></button>{index===0?<span className="cover-badge">Ảnh đại diện</span>:<button className="make-cover" type="button" disabled={saving||converting} onClick={()=>void setCover(img)}>Đặt đại diện</button>}</div><span>{formatBytes(img.size_bytes)} · WebP</span></div>)}{pendingImages.map((img,index)=><div className="edit-image" key={img.id}><div className="edit-image-photo"><img src={img.preview} alt={img.name}/><button type="button" className="image-remove" disabled={saving||converting} onClick={()=>{URL.revokeObjectURL(img.preview);setPendingImages(prev=>prev.filter(i=>i.id!==img.id));}} aria-label={`Bỏ ảnh ${img.name}`}><X size={14}/></button>{index===0&&!existingImages.length?<span className="cover-badge">Ảnh đại diện</span>:<span className="new-badge">Chưa lưu</span>}</div><span>{formatBytes(img.blob.size)} · {img.width} px</span></div>)}</div><p className="image-edit-note">Ảnh đã lưu được xóa hoặc đổi ảnh đại diện ngay khi bạn chọn thao tác.</p></div></div></fieldset>{formError&&<div className="form-error" role="alert"><span>{formError}</span><button type="button" className="text-btn" onClick={()=>void copy(formError,'Đã sao chép chi tiết lỗi (không chứa mật khẩu/token).')}>Sao chép chi tiết lỗi <Copy size={13}/></button></div>}</div><div className="editor-footer"><span><LockKeyhole size={14}/> Lưu riêng tư trên Supabase</span><div><button className="btn secondary" type="button" onClick={closeEditor} disabled={saving||converting}>Đóng</button><button className="btn primary" type="submit" disabled={saving||converting}>{saving?<Spinner/>:<Check size={17}/>} {saving?'Đang lưu…':'Lưu sản phẩm'}</button></div></div></form></section></div>}
    {deleteTarget&&<div className="modal-backdrop"><section className="small-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" onKeyDown={e=>trapDialog(e,()=>{if(!deleting)setDeleteTarget(null);})}><span className="delete-icon"><Trash2 size={23}/></span><h2 id="delete-title">Xóa sản phẩm này?</h2><p><strong>{deleteTarget.name}</strong> và {deleteTarget.product_images.length} ảnh liên quan sẽ bị xóa khỏi Supabase. Thao tác này không thể hoàn tác.</p><div className="button-row right"><button className="btn secondary" autoFocus disabled={deleting} onClick={()=>setDeleteTarget(null)}>Giữ lại</button><button className="btn danger" disabled={deleting} onClick={()=>void removeProduct()}>{deleting?<Spinner/>:<Trash2 size={16}/>} Xóa sản phẩm</button></div></section></div>}
    {preview&&<div className="modal-backdrop image-preview" role="dialog" aria-modal="true" aria-label="Xem ảnh" onKeyDown={e=>trapDialog(e,()=>setPreview(null))}><button autoFocus className="preview-close" onClick={()=>setPreview(null)} aria-label="Đóng ảnh"><X/></button><img src={preview.url} alt={preview.original_name}/><p>{preview.original_name} · {preview.width} × {preview.height} · {formatBytes(preview.size_bytes)}</p></div>}
  </div>;
}

function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function submit(event: FormEvent) { event.preventDefault(); if(busy)return; setBusy(true);setError(''); try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;onSuccess();}catch(error){setError(readableError(error));}finally{setBusy(false);} }
  return <div className="modal-backdrop"><section className="small-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onKeyDown={e=>trapDialog(e,()=>{if(!busy)onClose();})}><button className="icon-btn dialog-close" disabled={busy} onClick={onClose} aria-label="Đóng đăng nhập"><X size={20}/></button><span className="brand-mark"><Leaf size={24}/></span><h2 id="auth-title">Chào mừng về góc làm việc.</h2><p>Đăng nhập bằng tài khoản đã tạo trong Supabase Authentication của dự án.</p><form onSubmit={submit}><label className="form-field">Email<input autoFocus type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ban@example.com"/></label><label className="form-field">Mật khẩu<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mật khẩu tài khoản Supabase Auth"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn primary full" disabled={busy}>{busy?<Spinner/>:<LogIn size={17}/>} {busy?'Đang đăng nhập…':'Đăng nhập'}</button></form><p className="auth-footnote"><ShieldCheck size={14}/> Mật khẩu được gửi trực tiếp đến Supabase qua HTTPS.</p></section></div>;
}
