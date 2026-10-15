import { authorize,failure } from '@/lib/content-server';
import { getSiteSettings } from '@/lib/site-settings-server';
import { validateSettings } from '@/lib/site-settings';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await getSiteSettings(),{headers:{'Cache-Control':'no-store'}});}
export async function PUT(request:Request){
 try{
  const {db}=await authorize(request);
  const text=await request.text();if(text.length>100000)throw new Error('Cấu hình quá lớn.');
  const settings=validateSettings(JSON.parse(text));
  const {error}=await db.from('affiliate_site_settings').upsert({id:1,value:settings,updated_at:new Date().toISOString()});
  if(error)throw new Error('Chưa lưu được. Hãy chạy supabase/site-settings.sql và kiểm tra khóa server.');
  return Response.json({settings});
 }catch(error){return failure(error);}
}
