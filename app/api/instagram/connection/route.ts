import {authorize,failure,readBody} from '@/lib/content-server';
import {instagramConnectionStatus,instagramEncryptionKey} from '@/lib/instagram-connection';
import {encryptToken,decryptToken} from '@/lib/instagram-oauth-crypto';
import {refreshInstagramToken} from '@/lib/instagram-oauth';
export const runtime='nodejs';
export async function GET(request:Request){try{const {db,user}=await authorize(request);return Response.json(await instagramConnectionStatus(db,user.id),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function DELETE(request:Request){try{const {db,user}=await authorize(request);const {error}=await db.from('affiliate_instagram_connections').delete().eq('owner_id',user.id);if(error)throw new Error('Không ngắt được kết nối.');await db.from('affiliate_instagram_oauth_states').delete().eq('owner_id',user.id);return Response.json({ok:true});}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const {db,user}=await authorize(request);const {action}=await readBody(request);if(action!=='refresh')throw new Error('Thao tác không hợp lệ.');
 const {data:connection,error}=await db.from('affiliate_instagram_connections').select('*').eq('owner_id',user.id).single();if(error||!connection)throw new Error('Chưa có kết nối trực tiếp Instagram.');
 if(new Date(connection.expires_at).getTime()<=Date.now())throw new Error('Token đã hết hạn. Kết nối lại Instagram.');if(Date.now()-new Date(connection.issued_at).getTime()<86400000)throw new Error('Chỉ gia hạn token sau ít nhất 24 giờ kể từ khi cấp/gia hạn gần nhất.');
 const credential=await refreshInstagramToken(decryptToken(connection.access_token_encrypted,instagramEncryptionKey()));
 const {error:saveError}=await db.from('affiliate_instagram_connections').update({access_token_encrypted:encryptToken(credential.token,instagramEncryptionKey()),expires_at:new Date(Date.now()+credential.expiresIn*1000).toISOString(),issued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('updated_at',connection.updated_at).select().single();if(saveError)throw new Error('Kết nối đã thay đổi hoặc không lưu được token gia hạn. Làm mới để kiểm tra.');return Response.json({ok:true});
}catch(error){return failure(error);}}
