import {instagramTarget} from '@/lib/instagram-connection';
import {authorize,env,failure,readBody} from '@/lib/content-server';
import {metaRequest} from '@/lib/social-publish';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {db,user}=await authorize(request);const {channel}=await readBody(request);if(!['facebook','instagram','threads'].includes(channel))throw new Error('Kênh không hợp lệ.');
 const threads=channel==='threads',instagram=channel==='instagram';
 const target=instagram?await instagramTarget(db,user.id):{id:env(threads?'THREADS_USER_ID':'FACEBOOK_PAGE_ID'),token:env(threads?'THREADS_ACCESS_TOKEN':'FACEBOOK_PAGE_ACCESS_TOKEN'),version:threads?'v1.0':env('META_GRAPH_VERSION')};
 const {id,version,token}=target;if(!/^\d+$/.test(id)||!/^v\d+\.\d+$/.test(version))throw new Error('Kiểm tra ID hoặc phiên bản API.');
 const direct=instagram&&'instagramLogin' in target&&target.instagramLogin==='instagram';
 const host=threads?'https://graph.threads.net/v1.0':direct?`https://graph.instagram.com/${version}`:`https://graph.facebook.com/${version}`;
 const fields=direct?'user_id,username':channel==='facebook'?'id,name':'id,username';
 const result=await metaRequest(`${host}/${threads||direct?'me':id}?fields=${fields}`,token);if(String(result.user_id??result.id)!==id)throw new Error('Token thuộc tài khoản khác ID đang cấu hình.');

 return Response.json({id:String(result.id),name:result.username||result.name||'',message:'Đọc được đúng tài khoản. Chưa kiểm tra quyền xuất bản bằng bài thật.'},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
