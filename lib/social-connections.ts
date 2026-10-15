import {OperationError} from './operation-error';
import {createHmac} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {env} from './content-server';
import {instagramOrigin} from './instagram-connection';
import {decryptToken} from './instagram-oauth-crypto';
import {appSecretProof,type OAuthProvider} from './social-oauth';
export const SOCIAL_PROVIDER_NAMES={facebook:'Facebook Fanpage',threads:'Threads'};
export function socialRedirectURI(provider:OAuthProvider){return instagramOrigin()+`/api/${provider}/callback`;}
export function socialVersion(provider:OAuthProvider){if(provider==='threads')return 'v1.0';const value=process.env.META_GRAPH_VERSION?.trim()||'v26.0';if(!/^v\d+\.\d+$/.test(value))throw new Error('META_GRAPH_VERSION không hợp lệ.');return value;}
export const socialAppId=(provider:OAuthProvider)=>env(provider==='facebook'?'FACEBOOK_APP_ID':'THREADS_APP_ID');
export const socialAppSecret=(provider:OAuthProvider)=>env(provider==='facebook'?'FACEBOOK_APP_SECRET':'THREADS_APP_SECRET');
export function socialEncryptionKey(provider:OAuthProvider){return createHmac('sha256',process.env.SOCIAL_TOKEN_ENCRYPTION_SECRET?.trim()||socialAppSecret(provider)).update(`nep-social-${provider}-encryption-v1`).digest('hex');}
export function socialAppConfigured(provider:OAuthProvider){return !!process.env[provider==='facebook'?'FACEBOOK_APP_ID':'THREADS_APP_ID']?.trim()&&!!process.env[provider==='facebook'?'FACEBOOK_APP_SECRET':'THREADS_APP_SECRET']?.trim();}
export async function socialConnectionStatus(db:SupabaseClient,ownerId:string,provider:OAuthProvider){
 const {data,error}=await db.from('affiliate_social_connections').select('actor_id,display_name,active,expires_at,issued_at').eq('owner_id',ownerId).eq('provider',provider).maybeSingle();
 const expired=!!data?.expires_at&&new Date(data.expires_at).getTime()<=Date.now();const active=!!data?.active&&!expired;
 const manual=!data&&!!process.env[provider==='facebook'?'FACEBOOK_PAGE_ID':'THREADS_USER_ID']&&!!process.env[provider==='facebook'?'FACEBOOK_PAGE_ACCESS_TOKEN':'THREADS_ACCESS_TOKEN'];
 return {provider,connected:active||manual,method:data?'oauth':manual?'manual':null,id:data?.actor_id??(manual?process.env[provider==='facebook'?'FACEBOOK_PAGE_ID':'THREADS_USER_ID']:'')??'',name:data?.display_name??'',expiresAt:data?.expires_at??null,issuedAt:data?.issued_at??null,expired,appConfigured:socialAppConfigured(provider),needsSQL:!!error,redirectURI:socialRedirectURI(provider)};
}
export async function socialTarget(db:SupabaseClient,ownerId:string,provider:OAuthProvider){
 const {data}=await db.from('affiliate_social_connections').select('actor_id,token_encrypted,active,expires_at').eq('owner_id',ownerId).eq('provider',provider).maybeSingle();
 let id:string,token:string,proof:string|undefined;
 if(data){if(!data.active)throw new Error(`Đã ngắt kết nối ${SOCIAL_PROVIDER_NAMES[provider]}. Kết nối lại trước khi đăng.`);if(data.expires_at&&new Date(data.expires_at).getTime()<=Date.now())throw new OperationError(`Token ${SOCIAL_PROVIDER_NAMES[provider]} hết hạn. Kết nối lại hoặc gia hạn trong Thiết lập.`,'token');id=data.actor_id;try{token=decryptToken(data.token_encrypted,socialEncryptionKey(provider));}catch{throw new OperationError('Không giải mã được token. Kết nối lại sau khi đổi App Secret/khóa mã hóa.','token');}if(provider==='facebook')proof=appSecretProof(token,socialAppSecret(provider));}
 else{id=env(provider==='facebook'?'FACEBOOK_PAGE_ID':'THREADS_USER_ID');token=env(provider==='facebook'?'FACEBOOK_PAGE_ACCESS_TOKEN':'THREADS_ACCESS_TOKEN');}
 return {id,token,version:socialVersion(provider),appSecretProof:proof};
}
