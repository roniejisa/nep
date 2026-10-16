import {authorize} from '@/lib/content-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = {'Cache-Control': 'private, no-store'};
  if (!request.headers.get('authorization')?.match(/^Bearer (.+)$/)) {
    return Response.json({error: 'Vui lòng đăng nhập.'}, {status: 401, headers});
  }
  try {
    const {user} = await authorize(request);
    return Response.json({userId: user.id}, {headers});
  } catch {
    return Response.json({error: 'Không thể xác nhận quyền quản trị. Hãy đăng nhập đúng tài khoản hoặc kiểm tra cấu hình máy chủ.'}, {status: 403, headers});
  }
}
