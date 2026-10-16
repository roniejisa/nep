'use client';

import {useEffect, useState, type FormEvent, type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase';

export default function AdminAccessGate({children}: {children: ReactNode}) {
  const [access, setAccess] = useState<'checking' | 'login' | 'allowed'>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let revision = 0;
    let controller: AbortController | undefined;
    async function verify(session: Session | null, lock = true) {
      const current = ++revision;
      controller?.abort();
      if (!active) return;
      if (!session) {setAccess('login'); return;}
      if (lock) setAccess('checking');
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 10000);
      try {
        const response = await fetch('/api/admin/access/', {
          headers: {Authorization: `Bearer ${session.access_token}`},
          cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (!active || current !== revision) return;
        if (!response.ok || result.userId !== session.user.id) throw new Error();
        setError(''); setAccess('allowed');
      } catch {
        if (active && current === revision) {
          setAccess('login');
          setError('Không thể xác nhận quyền quản trị. Vui lòng đăng nhập đúng tài khoản. Nếu vẫn lỗi, kiểm tra cấu hình máy chủ.');
        }
      } finally {clearTimeout(timeout);}
    }
    const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
      // Do not await Supabase auth methods inside its auth event callback.
      void verify(session);
    });
    async function refresh(lock = false) {
      const before = revision;
      try {
        const {data, error: sessionError} = await supabase.auth.getSession();
        if (!active || before !== revision) return;
        if (sessionError) throw sessionError;
        void verify(data.session, lock);
      } catch {if (active && before === revision) {revision++; setAccess('login');}}
    }
    void refresh(true);
    const timer = setInterval(() => void refresh(), 60000);
    const focus = () => {if (document.visibilityState === 'visible') void refresh();};
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      active = false; revision++; controller?.abort(); clearInterval(timer);
      listener.subscription.unsubscribe(); window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const {error: loginError} = await supabase.auth.signInWithPassword({email: email.trim(), password});
      if (loginError) throw loginError;
      setPassword('');
    } catch {setError('Đăng nhập không thành công. Kiểm tra email và mật khẩu rồi thử lại.');}
    finally {setBusy(false);}
  }

  if (access === 'allowed') return children;
  return <main className="admin-login-screen">
    <section className="admin-login-card" aria-labelledby="admin-login-title">
      <h1 id="admin-login-title">Đăng nhập quản trị</h1>
      {access === 'checking' ? <p role="status">Đang kiểm tra phiên đăng nhập…</p> : <>
        <p>Vui lòng đăng nhập để tiếp tục.</p>
        <form onSubmit={login}>
          <label className="form-field">Email<input autoComplete="username" type="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
          <label className="form-field">Mật khẩu<input autoComplete="current-password" type="password" required value={password} onChange={event => setPassword(event.target.value)}/></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary full" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </form>
      </>}
    </section>
  </main>;
}
