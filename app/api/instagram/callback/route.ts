import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {database,env} from '@/lib/content-server';
import {sameState,stateHash,encryptToken} from '@/lib/instagram-oauth-crypto';
import {exchangeInstagramCode} from '@/lib/instagram-oauth';
import {instagramOrigin,instagramRedirectURI,instagramVersion,instagramEncryptionKey} from '@/lib/instagram-connection';
import {metaRequest} from '@/lib/social-publish';
export const runtime='nodejs';export const maxDuration=120;
function finish(status:string){const url=new URL('/',instagramOrigin());url.searchParams.set('instagram_result',status);const response=NextResponse.redirect(url,303);response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');response.cookies.set('nep_ig_oauth_state','',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/instagram',maxAge:0});return response;}
export async function GET(request:Request){
 try{
  const url=new URL(request.url),state=url.searchParams.get('state')??'',cookie=(await cookies()).get('nep_ig_oauth_state')?.value??'';
  if(state.length>200||!sameState(state,cookie))return finish('state');
  const db=database();const {data:nonce,error}=await db.from('affiliate_instagram_oauth_states').update({used:true}).eq('state_hash',stateHash(state)).eq('used',false).gt('expires_at',new Date().toISOString()).select('owner_id').maybeSingle();if(error||!nonce)return finish('state');
  if(nonce.owner_id!==env('CONTENT_ADMIN_USER_ID'))return finish('state');
  if(url.searchParams.has('error'))return finish('denied');
  const code=url.searchParams.get('code');if(!code||code.length>5000)return finish('failed');
  const credential=await exchangeInstagramCode({appId:env('INSTAGRAM_APP_ID'),appSecret:env('INSTAGRAM_APP_SECRET'),redirectURI:instagramRedirectURI(),code});
  const identity=await metaRequest(`https://graph.instagram.com/${instagramVersion()}/me?fields=user_id,username`,credential.token);
  const id=String(identity.user_id??identity.id??'');if(!/^\d+$/.test(id)||typeof identity.username!=='string')return finish('identity');
  const now=new Date().toISOString();const {error:saveError}=await db.from('affiliate_instagram_connections').upsert({owner_id:nonce.owner_id,instagram_user_id:id,username:identity.username,access_token_encrypted:encryptToken(credential.token,instagramEncryptionKey()),expires_at:new Date(Date.now()+credential.expiresIn*1000).toISOString(),issued_at:now,updated_at:now});
  if(saveError)return finish('storage');return finish('connected');
 }catch{return finish('failed');}
}
