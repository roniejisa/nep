import {instagramConnectionStatus} from '@/lib/instagram-connection';
import { authorize, failure } from '@/lib/content-server';
import { aiConfigured, configuredProviders, defaultModels, MODEL_SUGGESTIONS } from '@/lib/ai-provider';
export const runtime='nodejs';
export async function GET(request:Request) {
 try {
  const {db,user}=await authorize(request);
  const {data:posts,error}=await db.from('affiliate_content_posts').select('*').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(50);
  if(error) throw new Error('Chưa đọc được lịch sử. Chạy supabase/content.sql trong SQL Editor.');
  const instagram=await instagramConnectionStatus(db,user.id);
  return Response.json({posts,instagram,ai:{providers:configuredProviders(),defaults:defaultModels(),suggestions:MODEL_SUGGESTIONS},configured:{ai:aiConfigured(),facebook:!!process.env.FACEBOOK_PAGE_ID && !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN && !!process.env.META_GRAPH_VERSION,instagram:instagram.connected&&!!process.env.PUBLIC_SITE_URL,threads:!!process.env.THREADS_USER_ID && !!process.env.THREADS_ACCESS_TOKEN},targets:{instagram:instagram.id,facebook:process.env.FACEBOOK_PAGE_ID ?? '',threads:process.env.THREADS_USER_ID ?? ''}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
