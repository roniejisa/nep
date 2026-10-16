'use client';
import {useState,type FormEvent,type KeyboardEvent} from 'react';
import {Package,Plus,Leaf,Loader2,LogIn,ShieldCheck,X} from 'lucide-react';
import {supabase,readableError} from '@/lib/supabase';
export function EmptyArt() { return <div className="empty-art" aria-hidden="true"><div className="art-dot dot-one"/><div className="art-dot dot-two"/><div className="art-card back-card"/><div className="art-card front-card"><div className="art-photo"><Package size={36} strokeWidth={1.35}/></div><i/><i className="short-line"/></div><span className="art-plus"><Plus size={22}/></span><span className="art-leaf"><Leaf size={21}/></span></div>; }
export function trapDialog(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key !== 'Tab') return;
  const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length > 0);
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
export function Spinner() { return <Loader2 size={17} className="spin"/>; }

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function submit(event: FormEvent) { event.preventDefault(); if(busy)return; setBusy(true);setError(''); try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;onSuccess();}catch(error){setError(readableError(error));}finally{setBusy(false);} }
  return <div className="modal-backdrop"><section className="small-dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" onKeyDown={e=>trapDialog(e,()=>{if(!busy)onClose();})}><button className="icon-btn dialog-close" disabled={busy} onClick={onClose} aria-label="Đóng đăng nhập"><X size={20}/></button><span className="brand-mark"><Leaf size={24}/></span><h2 id="auth-title">Chào mừng về góc làm việc.</h2><p>Đăng nhập bằng tài khoản đã tạo trong Supabase Authentication của dự án.</p><form onSubmit={submit}><label className="form-field">Email<input autoFocus type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ban@example.com"/></label><label className="form-field">Mật khẩu<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mật khẩu tài khoản Supabase Auth"/></label>{error&&<div className="form-error" role="alert">{error}</div>}<button className="btn primary full" disabled={busy}>{busy?<Spinner/>:<LogIn size={17}/>} {busy?'Đang đăng nhập…':'Đăng nhập'}</button></form><p className="auth-footnote"><ShieldCheck size={14}/> Mật khẩu được gửi trực tiếp đến Supabase qua HTTPS.</p></section></div>;
}

export const statusNames={draft:'Bản nháp',ready:'Sẵn sàng',archived:'Lưu trữ'};
export const money=(n:number|null)=>n===null?'Chưa có giá':new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(n);
export const date=(s:string)=>new Date(s).toLocaleDateString('vi-VN');
