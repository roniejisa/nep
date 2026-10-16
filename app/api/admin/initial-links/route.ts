import {authorize} from '@/lib/content-server';
export const dynamic='force-dynamic';
const links = ['https://s.shopee.vn/4LK8gjOA0T', 'https://s.shopee.vn/9zyVRBR0eW', 'https://s.shopee.vn/AAHvdXKlPL', 'https://s.shopee.vn/4qGPHnPuNv', 'https://s.shopee.vn/1qcniJnijP'];
export async function GET(request:Request){try{await authorize(request);return Response.json({links},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Vui lòng đăng nhập bằng tài khoản quản trị.'},{status:403,headers:{'Cache-Control':'private, no-store'}});}}
