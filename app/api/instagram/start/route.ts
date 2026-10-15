import {randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {authorize,env,failure} from '@/lib/content-server';
import {stateHash} from '@/lib/instagram-oauth-crypto';
import {instagramAuthURL} from '@/lib/instagram-oauth';
import {instagramOrigin,instagramRedirectURI} from '@/lib/instagram-connection';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const {db,user}=await authorize(request);const origin=instagramOrigin();if(new URL(request.url).origin!==origin)throw new Error('Mở website Production đúng PUBLIC_SITE_URL để kết nối Instagram.');
 const appId=env('INSTAGRAM_APP_ID');env('INSTAGRAM_APP_SECRET');const state=randomBytes(32).toString('base64url');
 await db.from('affiliate_instagram_oauth_states').delete().eq('owner_id',user.id).lt('expires_at',new Date().toISOString());
 const {error}=await db.from('affiliate_instagram_oauth_states').insert({state_hash:stateHash(state),owner_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});if(error)throw new Error('Chưa tạo được phiên kết nối. Chạy supabase/instagram-oauth.sql.');
 const response=NextResponse.json({url:instagramAuthURL(appId,instagramRedirectURI(),state)});response.headers.set('Cache-Control','no-store');response.cookies.set('nep_ig_oauth_state',state,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/instagram',maxAge:600});return response;
}catch(error){return failure(error);}}
