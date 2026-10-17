'use client';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {supabase} from '@/lib/supabase';
import {createAccessController,type AccessSnapshot} from '@/lib/admin-access-state';
export default function AdminAccessGate({children}:{children:ReactNode}){
 const [access,setAccess]=useState<AccessSnapshot>({view:'checking',warning:'',error:'',refreshing:false});
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[loginError,setLoginError]=useState('');
 const controllerRef=useRef<ReturnType<typeof createAccessController>|null>(null);
 useEffect(()=>{
  const controller=createAccessController({
   onChange:setAccess,
   getSession:async()=>{const {data,error}=await supabase.auth.getSession();if(error)throw error;return data.session;},
   refreshSession:async()=>{const {data,error}=await supabase.auth.refreshSession();if(error){if(error.status&&error.status>=400&&error.status<500&&error.status!==429)return null;throw error;}return data.session;},
   check:async(session,signal)=>{const response=await fetch('/api/admin/access/',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',signal});if(response.status!==200)return {status:response.status};const value=await response.json();return {status:response.status,userId:value.userId};},
  });
  controllerRef.current=controller;
  const {data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
   // No awaited SDK auth call here: same-account events only check the server in the background.
   void controller.sessionChanged(event==='SIGNED_OUT'?null:session);
  });
  void controller.refresh();
  const focus=()=>{if(document.visibilityState==='visible')void controller.refresh();};
  const timer=setInterval(()=>{controller.tick();if(document.visibilityState==='visible')void controller.refresh();},60000);
  window.addEventListener('focus',focus);window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
  return()=>{controller.stop();controllerRef.current=null;clearInterval(timer);listener.subscription.unsubscribe();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus);};
 },[]);
 async function login(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setLoginError('');
  try{const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');}
  catch{setLoginError('Đăng nhập không thành công. Kiểm tra email và mật khẩu rồi thử lại.');}finally{setBusy(false);}
 }
 async function signOut(){if(busy)return;setBusy(true);setLoginError('');try{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;void controllerRef.current?.sessionChanged(null);}catch{setLoginError('Chưa đăng xuất được. Kiểm tra kết nối rồi thử lại.');}finally{setBusy(false);}}
 if(access.view==='allowed')return <>
  {access.warning&&<aside className="admin-access-warning" role="status"><span>{access.warning}</span><button className="text-btn" disabled={access.refreshing} onClick={()=>void controllerRef.current?.refresh(true)}>{access.refreshing?'Đang kiểm tra…':'Thử lại'}</button></aside>}
  {children}
 </>;
 return <main className="admin-login-screen"><section className="admin-login-card" aria-labelledby="admin-login-title">
  <h1 id="admin-login-title">{access.view==='checking'?'Đang mở quản trị':access.view==='unavailable'?'Chưa kết nối được quản trị':'Đăng nhập quản trị'}</h1>
  {access.view==='checking'?<p role="status">Đang kiểm tra phiên đăng nhập…</p>:access.view==='unavailable'?<>
   <p role="status">{access.error}</p><div className="button-row"><button className="btn primary" disabled={access.refreshing||busy} onClick={()=>void controllerRef.current?.refresh(true)}>{access.refreshing?'Đang kiểm tra…':'Thử lại'}</button><button className="btn secondary" disabled={access.refreshing||busy} onClick={()=>void signOut()}>Đăng xuất</button></div>{loginError&&<p className="form-error" role="alert">{loginError}</p>}
  </>:<><p>Vui lòng đăng nhập để tiếp tục.</p><form onSubmit={login}><label className="form-field">Email<input autoComplete="username" type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label className="form-field">Mật khẩu<input autoComplete="current-password" type="password" required value={password} onChange={event=>setPassword(event.target.value)}/></label>{(loginError||access.error)&&<p className="form-error" role="alert">{loginError||access.error}</p>}<button className="btn primary full" disabled={busy||access.refreshing}>{busy?'Đang đăng nhập…':'Đăng nhập'}</button></form></>}
 </section></main>;
}
