import {socialConnectionStatus} from '@/lib/social-connections';
import {instagramConnectionStatus} from '@/lib/instagram-connection';
import { authorize, failure } from '@/lib/content-server';
import { aiConfigured, configuredProviders, defaultModels, MODEL_SUGGESTIONS } from '@/lib/ai-provider';
export const runtime='nodejs';
export async function GET(request:Request) {
 try {
  const {db,user}=await authorize(request);
  const {data:posts,error}=await db.from('affiliate_content_posts').select('*').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(50);
  if(error) throw new Error('Chưa đọc được lịch sử. Chạy supabase/content.sql trong SQL Editor.');
  const [instagram,facebook,threads]=await Promise.all([instagramConnectionStatus(db,user.id),socialConnectionStatus(db,user.id,'facebook'),socialConnectionStatus(db,user.id,'threads')]);
  return Response.json({posts,instagram,facebook,threads,ai:{providers:configuredProviders(),defaults:defaultModels(),suggestions:MODEL_SUGGESTIONS},configured:{ai:aiConfigured(),facebook:facebook.connected,instagram:instagram.connected&&!!process.env.PUBLIC_SITE_URL,threads:threads.connected},targets:{instagram:instagram.id,facebook:facebook.id,threads:threads.id}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
