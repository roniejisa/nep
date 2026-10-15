import { createClient } from '@supabase/supabase-js';
// This module is imported only by server route handlers. Never import in client components.
export function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường ${name} trên Vercel.`);
  return value;
}
export function database() {
  return createClient('https://aegbygaxnynjfkmogpbg.supabase.co', env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorize(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error('Vui lòng đăng nhập.');
  const db = database();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error('Phiên đăng nhập hết hạn.');
  if (data.user.id !== env('CONTENT_ADMIN_USER_ID')) throw new Error('Tài khoản này chưa được cấp quyền tạo và đăng bài.');
  return { db, user: data.user };
}
export function failure(error: unknown) {
  // Never forward provider response bodies; they may contain secrets or request URLs.
  const message = error instanceof Error ? error.message : 'Thao tác thất bại.';
  return Response.json({ error: message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
}
export async function readBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 16000) throw new Error('Yêu cầu quá dài.');
  return JSON.parse(raw);
}
export async function metaPost(url: string, token: string, values: Record<string, string>) {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: new URLSearchParams(values), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok || data.error || !data.id) throw new Error(`Meta không xác nhận thành công (HTTP ${response.status}, mã ${data.error?.code ?? 'không có'}). Kiểm tra quyền/token và trang đích trước khi thử lại.`);
  return String(data.id);
}
