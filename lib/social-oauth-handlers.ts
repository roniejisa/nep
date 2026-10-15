import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {authorize,database,env,failure,readBody} from './content-server';
import {instagramOrigin} from './instagram-connection';
import {sameState,stateHash,encryptToken,decryptToken} from './instagram-oauth-crypto';
import {socialAuthURL,exchangeSocialCode,listFacebookPages,refreshThreadsToken,type OAuthProvider,type FacebookPageChoice} from './social-oauth';
import {socialRedirectURI,socialAppId,socialAppSecret,socialVersion,socialEncryptionKey,socialConnectionStatus} from './social-connections';
import {metaRequest} from './social-publish';
const cookieName=(p:OAuthProvider)=>`nep_${p}_oauth_state`;
export async function startSocial(request:Request,provider:OAuthProvider){try{
 const {db,user}=await authorize(request);if(new URL(request.url).origin!==instagramOrigin())throw new Error('Mở đúng Production PUBLIC_SITE_URL để kết nối.');const appId=socialAppId(provider);socialAppSecret(provider);
 const state=randomBytes(32).toString('base64url');await db.from('affiliate_social_oauth_states').delete().eq('owner_id',user.id).eq('provider',provider).lt('expires_at',new Date().toISOString());
 const {error}=await db.from('affiliate_social_oauth_states').insert({state_hash:stateHash(state),owner_id:user.id,provider,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw new Error('Chạy supabase/social-oauth.sql trước khi kết nối.');
 const response=NextResponse.json({url:socialAuthURL(provider,appId,socialRedirectURI(provider),state,socialVersion(provider),provider==='facebook'?process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim():undefined)});response.headers.set('Cache-Control','no-store');response.cookies.set(cookieName(provider),state,{httpOnly:true,secure:true,sameSite:'lax',path:`/api/${provider}`,maxAge:600});return response;
}catch(error){return failure(error);}}
function finish(provider:OAuthProvider,status:string){const url=new URL('/',instagramOrigin());url.searchParams.set(`${provider}_result`,status);const response=NextResponse.redirect(url,303);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');response.cookies.set(cookieName(provider),'',{httpOnly:true,secure:true,sameSite:'lax',path:`/api/${provider}`,maxAge:0});return response;}
export async function callbackSocial(request:Request,provider:OAuthProvider){try{
 const url=new URL(request.url),state=url.searchParams.get('state')??'',cookie=(await cookies()).get(cookieName(provider))?.value??'';if(state.length>200||!sameState(state,cookie))return finish(provider,'state');
 const db=database();const {data:nonce,error}=await db.from('affiliate_social_oauth_states').update({used:true}).eq('state_hash',stateHash(state)).eq('provider',provider).eq('used',false).gt('expires_at',new Date().toISOString()).select('owner_id').maybeSingle();if(error||!nonce||nonce.owner_id!==env('CONTENT_ADMIN_USER_ID'))return finish(provider,'state');
 if(url.searchParams.has('error'))return finish(provider,'denied');const code=url.searchParams.get('code');if(!code||code.length>5000)return finish(provider,'failed');
 const credential=await exchangeSocialCode({provider,appId:socialAppId(provider),appSecret:socialAppSecret(provider),redirectURI:socialRedirectURI(provider),code,version:socialVersion(provider)});
 if(provider==='facebook'){
  const pages=await listFacebookPages(credential.token,socialAppSecret(provider),socialVersion(provider));if(!pages.length)return finish(provider,'nopages');
  const {error:saveError}=await db.from('affiliate_facebook_page_choices').upsert({owner_id:nonce.owner_id,pages_encrypted:encryptToken(JSON.stringify(pages),socialEncryptionKey(provider)),expires_at:new Date(Date.now()+600000).toISOString(),updated_at:new Date().toISOString()});if(saveError)return finish(provider,'storage');return finish(provider,'choose');
 }
 const identity=await metaRequest('https://graph.threads.net/v1.0/me?fields=id,username',credential.token);const id=String(identity.id??'');if(!/^\d+$/.test(id)||typeof identity.username!=='string')return finish(provider,'identity');
 const now=new Date().toISOString();const {error:saveError}=await db.from('affiliate_social_connections').upsert({owner_id:nonce.owner_id,provider,actor_id:id,display_name:identity.username,token_encrypted:encryptToken(credential.token,socialEncryptionKey(provider)),active:true,expires_at:new Date(Date.now()+credential.expiresIn!*1000).toISOString(),issued_at:now,updated_at:now});if(saveError)return finish(provider,'storage');return finish(provider,'connected');
}catch{return finish(provider,'failed');}}
export async function getSocialConnection(request:Request,provider:OAuthProvider){try{
 const {db,user}=await authorize(request);const status=await socialConnectionStatus(db,user.id,provider);let pages:{id:string;name:string}[]=[];
 if(provider==='facebook'){
  const {data:pending}=await db.from('affiliate_facebook_page_choices').select('pages_encrypted,expires_at').eq('owner_id',user.id).maybeSingle();
  if(pending&&new Date(pending.expires_at).getTime()>Date.now()){try{const all=JSON.parse(decryptToken(pending.pages_encrypted,socialEncryptionKey(provider))) as FacebookPageChoice[];pages=all.map(p=>({id:p.id,name:p.name}));}catch{throw new Error('Không đọc được danh sách Page; kết nối lại Facebook.');}}
 }
 return Response.json({...status,pages},{headers:{'Cache-Control':'no-store'}});
}catch(error){return failure(error);}}
export async function updateSocialConnection(request:Request,provider:OAuthProvider){try{
 const {db,user}=await authorize(request);const {action,pageId}=await readBody(request);
 if(provider==='facebook'&&action==='select'){
  if(typeof pageId!=='string'||!/^\d+$/.test(pageId))throw new Error('Chọn Fanpage hợp lệ.');
  const {data:pending,error}=await db.from('affiliate_facebook_page_choices').select('*').eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).single();if(error||!pending)throw new Error('Danh sách Fanpage hết hạn. Kết nối lại Facebook.');
  const pages=JSON.parse(decryptToken(pending.pages_encrypted,socialEncryptionKey(provider))) as FacebookPageChoice[];const page=pages.find(p=>p.id===pageId);if(!page)throw new Error('Page không nằm trong danh sách bạn vừa cấp quyền.');
  const now=new Date().toISOString();const {error:saveError}=await db.from('affiliate_social_connections').upsert({owner_id:user.id,provider,actor_id:page.id,display_name:page.name,token_encrypted:encryptToken(page.token,socialEncryptionKey(provider)),active:true,expires_at:null,issued_at:now,updated_at:now});if(saveError)throw new Error('Không lưu được Fanpage đã chọn.');
  await db.from('affiliate_facebook_page_choices').delete().eq('owner_id',user.id).eq('updated_at',pending.updated_at);return Response.json({ok:true});
 }
 if(provider==='threads'&&action==='refresh'){
  const {data:connection,error}=await db.from('affiliate_social_connections').select('*').eq('owner_id',user.id).eq('provider',provider).eq('active',true).single();if(error||!connection)throw new Error('Chưa có kết nối OAuth Threads.');
  if(!connection.expires_at||new Date(connection.expires_at).getTime()<=Date.now())throw new Error('Token hết hạn; kết nối lại Threads.');if(Date.now()-new Date(connection.issued_at).getTime()<86400000)throw new Error('Chỉ gia hạn sau ít nhất 24 giờ từ lần cấp/gia hạn gần nhất.');
  const credential=await refreshThreadsToken(decryptToken(connection.token_encrypted,socialEncryptionKey(provider)));
  const {error:saveError}=await db.from('affiliate_social_connections').update({token_encrypted:encryptToken(credential.token,socialEncryptionKey(provider)),expires_at:new Date(Date.now()+credential.expiresIn*1000).toISOString(),issued_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('provider',provider).eq('updated_at',connection.updated_at).select().single();if(saveError)throw new Error('Kết nối vừa thay đổi hoặc chưa lưu được token. Làm mới để kiểm tra.');return Response.json({ok:true});
 }
 throw new Error('Thao tác không hợp lệ.');
}catch(error){return failure(error);}}
export async function disconnectSocial(request:Request,provider:OAuthProvider){try{
 const {db,user}=await authorize(request);const now=new Date().toISOString();const {error}=await db.from('affiliate_social_connections').upsert({owner_id:user.id,provider,actor_id:'',display_name:'',token_encrypted:null,active:false,expires_at:null,issued_at:now,updated_at:now});if(error)throw new Error('Không ngắt được kết nối.');
 await db.from('affiliate_social_oauth_states').delete().eq('owner_id',user.id).eq('provider',provider);if(provider==='facebook')await db.from('affiliate_facebook_page_choices').delete().eq('owner_id',user.id);return Response.json({ok:true});
}catch(error){return failure(error);}}
