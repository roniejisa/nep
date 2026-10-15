import {requestPage} from '@/lib/pagination';
import {isChannel} from '@/lib/content-rules';
import {socialConnectionStatus} from '@/lib/social-connections';
import {instagramConnectionStatus} from '@/lib/instagram-connection';
import { authorize, failure } from '@/lib/content-server';
import { aiConfigured, configuredProviders, defaultModels, MODEL_SUGGESTIONS } from '@/lib/ai-provider';
export const runtime='nodejs';
export async function GET(request:Request) {
 try {
  const {db,user}=await authorize(request);
  const url=new URL(request.url),page=requestPage(url.searchParams.get('page')),channel=url.searchParams.get('channel'),status=url.searchParams.get('status')||'all',size=6;
  let query=db.from('affiliate_content_posts').select('*',{count:'exact'}).eq('owner_id',user.id).is('deleted_at',null);
  const postId=url.searchParams.get('postId');if(postId&&/^[0-9a-f-]{36}$/i.test(postId))query=query.eq('id',postId);
  if(isChannel(channel))query=query.eq('channel',channel);
  if(status==='attention')query=query.in('status',['unknown','publishing']);else if(['draft','published'].includes(status))query=query.eq('status',status);
  const {data:posts,error,count}=await query.order('created_at',{ascending:false}).order('id').range((page-1)*size,page*size-1);
  const {count:draftCount}=await db.from('affiliate_content_posts').select('id',{count:'exact',head:true}).eq('owner_id',user.id).eq('status','draft').is('deleted_at',null);
  if(error) throw new Error('Chưa đọc được lịch sử. Chạy supabase/content.sql trong SQL Editor.');
  const [instagram,facebook,threads]=await Promise.all([instagramConnectionStatus(db,user.id),socialConnectionStatus(db,user.id,'facebook'),socialConnectionStatus(db,user.id,'threads')]);
  return Response.json({posts,total:count,pageSize:size,draftCount,instagram,facebook,threads,ai:{providers:configuredProviders(),defaults:defaultModels(),suggestions:MODEL_SUGGESTIONS},configured:{ai:aiConfigured(),facebook:facebook.connected,instagram:instagram.connected&&!!process.env.PUBLIC_SITE_URL,threads:threads.connected},targets:{instagram:instagram.id,facebook:facebook.id,threads:threads.id}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
