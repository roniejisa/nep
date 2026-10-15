import {authorize,env,failure,readBody} from '@/lib/content-server';
import {metaRequest} from '@/lib/social-publish';
export const runtime='nodejs';
export async function POST(request:Request){try{
 await authorize(request);const {channel}=await readBody(request);if(!['facebook','instagram','threads'].includes(channel))throw new Error('Kênh không hợp lệ.');
 const threads=channel==='threads',instagram=channel==='instagram';const id=env(threads?'THREADS_USER_ID':instagram?'INSTAGRAM_USER_ID':'FACEBOOK_PAGE_ID');const version=threads?'v1.0':env('META_GRAPH_VERSION');if(!/^\d+$/.test(id)||!/^v\d+\.\d+$/.test(version))throw new Error('Kiểm tra ID hoặc phiên bản API.');
 const token=instagram?(process.env.INSTAGRAM_ACCESS_TOKEN?.trim()||env('FACEBOOK_PAGE_ACCESS_TOKEN')):env(threads?'THREADS_ACCESS_TOKEN':'FACEBOOK_PAGE_ACCESS_TOKEN');
 const host=threads?'https://graph.threads.net/v1.0':`https://graph.facebook.com/${version}`;const fields=channel==='facebook'?'id,name':'id,username';
 const result=await metaRequest(`${host}/${threads?'me':id}?fields=${fields}`,token);if(String(result.id)!==id)throw new Error('Token thuộc tài khoản khác ID đang cấu hình.');
 return Response.json({id:String(result.id),name:result.username||result.name||'',message:'Đọc được đúng tài khoản. Chưa kiểm tra quyền xuất bản bằng bài thật.'},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
