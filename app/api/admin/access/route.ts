import {database,env} from '@/lib/content-server';
import {authFailureStatus} from '@/lib/admin-access-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = {'Cache-Control': 'private, no-store'};
  if (!request.headers.get('authorization')?.match(/^Bearer (.+)$/)) {
    return Response.json({error: 'Vui lòng đăng nhập.'}, {status: 401, headers});
  }
  try {
    const token=request.headers.get('authorization')!.match(/^Bearer (.+)$/)![1];
    const db=database();
    const {data,error}=await db.auth.getUser(token);
    if(error)return Response.json({error:'Chưa xác nhận được phiên quản trị.'},{status:authFailureStatus(error),headers});
    if(!data.user)return Response.json({error:'Phiên đăng nhập hết hạn.'},{status:401,headers});
    if(data.user.id!==env('CONTENT_ADMIN_USER_ID'))return Response.json({error:'Tài khoản không có quyền quản trị.'},{status:403,headers});
    return Response.json({userId: data.user.id}, {headers});
  } catch {
    return Response.json({error: 'Máy chủ tạm thời chưa xác nhận được quyền quản trị.'}, {status: 503, headers});
  }
}
