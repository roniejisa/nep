import {OperationError} from './operation-error';
import type {SupabaseClient} from '@supabase/supabase-js';
import {env} from './content-server';
import {decryptToken} from './instagram-oauth-crypto';
export function instagramOrigin(){const url=new URL(process.env.PUBLIC_SITE_URL?.trim()||'https://nep-hp.vercel.app');if(url.protocol!=='https:'||url.username||url.password)throw new Error('PUBLIC_SITE_URL phải là địa chỉ HTTPS Production.');return url.origin;}
export function instagramRedirectURI(){return instagramOrigin()+'/api/instagram/callback';}
export function instagramVersion(){const v=process.env.INSTAGRAM_GRAPH_VERSION?.trim()||process.env.META_GRAPH_VERSION?.trim()||'v26.0';if(!/^v\d+\.\d+$/.test(v))throw new Error('Phiên bản API Instagram chưa hợp lệ.');return v;}
export function instagramEncryptionKey(){return process.env.INSTAGRAM_TOKEN_ENCRYPTION_SECRET?.trim()||env('INSTAGRAM_APP_SECRET');}
export const directInstagramConfigured=()=>!!process.env.INSTAGRAM_APP_ID?.trim()&&!!process.env.INSTAGRAM_APP_SECRET?.trim();
export async function instagramConnectionStatus(db:SupabaseClient,ownerId:string){
 const {data,error}=await db.from('affiliate_instagram_connections').select('instagram_user_id,username,expires_at,issued_at').eq('owner_id',ownerId).maybeSingle();
 const directConfigured=directInstagramConfigured();const valid=!!data&&new Date(data.expires_at).getTime()>Date.now();
 const legacy=!data&&!directConfigured&&!!process.env.INSTAGRAM_USER_ID&&!!(process.env.INSTAGRAM_ACCESS_TOKEN||process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
 return {connected:valid||legacy,method:data?'instagram':legacy?'facebook':null,id:data?.instagram_user_id??(legacy?process.env.INSTAGRAM_USER_ID:'')??'',username:data?.username??'',expiresAt:data?.expires_at??null,issuedAt:data?.issued_at??null,directConfigured,needsSQL:!!error,expired:!!data&&!valid,redirectURI:instagramRedirectURI()};
}
export async function instagramTarget(db:SupabaseClient,ownerId:string){
 const {data,error}=await db.from('affiliate_instagram_connections').select('instagram_user_id,access_token_encrypted,expires_at').eq('owner_id',ownerId).maybeSingle();
 if(data){if(new Date(data.expires_at).getTime()<=Date.now())throw new OperationError('Kết nối Instagram hết hạn. Vào Thiết lập và kết nối lại.','token');let token;try{token=decryptToken(data.access_token_encrypted,instagramEncryptionKey());}catch{throw new OperationError('Không giải mã được token Instagram. Kết nối lại sau khi đổi App Secret/khóa mã hóa.','token');}return {id:data.instagram_user_id,token,version:instagramVersion(),instagramLogin:'instagram' as const};}
 if(directInstagramConfigured())throw new Error(error?'Chạy instagram-oauth.sql trước khi kết nối Instagram.':'Chưa kết nối Instagram. Vào Thiết lập → Kết nối Instagram.');
 return {id:env('INSTAGRAM_USER_ID'),token:process.env.INSTAGRAM_ACCESS_TOKEN?.trim()||env('FACEBOOK_PAGE_ACCESS_TOKEN'),version:env('META_GRAPH_VERSION'),instagramLogin:'facebook' as const};
}
