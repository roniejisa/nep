export type AppError = { message?: string; code?: string; statusCode?: string | number; step?: string };
export function operationError(step: string, error: unknown): AppError {
  const value = error as AppError;
  return { step, code: value?.code ?? (value?.statusCode ? String(value.statusCode) : undefined), message: value?.message || 'Có lỗi xảy ra.' };
}
export function readableError(error: unknown): string {
  const value = (error ?? {}) as AppError;
  const raw = value.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
  const code = value.code ?? (value.statusCode ? String(value.statusCode) : '');
  let explanation = '';
  if (code === 'PGRST205' || code === '42P01') explanation = 'Chưa có bảng dữ liệu. Mở Thiết lập và chạy script SQL trong Supabase.';
  else if (code === '23505') explanation = 'Link affiliate này đã có trong danh mục của bạn.';
  else if (raw.includes('Invalid login credentials')) explanation = 'Email hoặc mật khẩu chưa đúng. Dùng tài khoản tạo trong Supabase Authentication.';
  else if (raw.includes('Email not confirmed')) explanation = 'Email tài khoản chưa được xác nhận trong Supabase.';
  else if (raw.includes('permission denied for schema')) explanation = 'Tài khoản đang thiếu quyền truy cập schema cơ sở dữ liệu.';
  else if (raw.includes('permission denied for table')) explanation = 'Tài khoản đang thiếu quyền thao tác trên bảng được nêu bên dưới.';
  else if (raw.includes('row-level security')) explanation = 'Supabase từ chối do điều kiện RLS của bản ghi hoặc đường dẫn ảnh. Cần kiểm tra đúng policy của bước này.';
  else if (code === '42501') explanation = 'Supabase từ chối quyền truy cập. Chi tiết gốc được giữ bên dưới để xác định chính xác nguyên nhân.';
  else if (raw.includes('Failed to fetch')) explanation = 'Không kết nối được Supabase. Kiểm tra mạng và trạng thái dự án, sau đó thử lại.';
  const heading = [value.step, code].filter(Boolean).join(' · ');
  return [heading ? `[${heading}]` : '', explanation, explanation ? `Chi tiết: ${raw}` : raw].filter(Boolean).join('\n');
}
