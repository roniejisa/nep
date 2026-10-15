import {createHmac} from 'node:crypto';
export type OAuthProvider='facebook'|'threads';
export const OAUTH_SCOPES={facebook:['pages_show_list','pages_read_engagement','pages_manage_posts'],threads:['threads_basic','threads_content_publish']};
export function socialAuthURL(provider:OAuthProvider,appId:string,redirectURI:string,state:string,version='v26.0',configId?:string){
 if(!/^\d+$/.test(appId)||!/^v\d+\.\d+$/.test(version))throw new Error('App ID hoặc phiên bản API không hợp lệ.');
 if(configId&&!/^\d+$/.test(configId))throw new Error('FACEBOOK_LOGIN_CONFIG_ID phải là ID cấu hình dạng số.');
 const url=new URL(provider==='facebook'?`https://www.facebook.com/${version}/dialog/oauth`:'https://threads.com/oauth/authorize');
 url.search=new URLSearchParams({client_id:appId,redirect_uri:redirectURI,response_type:'code',...(provider==='facebook'&&configId?{config_id:configId}:{scope:OAUTH_SCOPES[provider].join(',')}),state,...(provider==='facebook'?{auth_type:'rerequest'}:{})}).toString();return url.href;
}
async function json(url:string,options:RequestInit,transport:typeof fetch){let response;try{response=await transport(url,{...options,signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});}catch{throw new Error('Không kết nối được Meta để cấp token.');}if(!response.ok)throw new Error(`Meta từ chối yêu cầu OAuth (HTTP ${response.status}).`);let value;try{value=await response.json();}catch{throw new Error('Meta trả OAuth không hợp lệ.');}if(value.error)throw new Error('Meta từ chối cấp quyền/token.');return value;}
export async function exchangeSocialCode(options:{provider:OAuthProvider;appId:string;appSecret:string;redirectURI:string;code:string;version?:string;transport?:typeof fetch}){
 const {provider,appId,appSecret,redirectURI,code}=options,transport=options.transport??fetch,version=options.version??'v26.0';
 if(!/^v\d+\.\d+$/.test(version))throw new Error('Phiên bản API không hợp lệ.');
 let short;
 if(provider==='threads')short=await json('https://graph.threads.net/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:appId,client_secret:appSecret,grant_type:'authorization_code',redirect_uri:redirectURI,code})},transport);
 else {const url=new URL(`https://graph.facebook.com/${version}/oauth/access_token`);url.search=new URLSearchParams({client_id:appId,client_secret:appSecret,redirect_uri:redirectURI,code}).toString();short=await json(url.href,{method:'GET'},transport);}
 if(typeof short.access_token!=='string'||!short.access_token)throw new Error('Meta chưa cấp token.');
 const url=new URL(provider==='threads'?'https://graph.threads.net/access_token':`https://graph.facebook.com/${version}/oauth/access_token`);
 url.search=new URLSearchParams(provider==='threads'?{grant_type:'th_exchange_token',client_secret:appSecret,access_token:short.access_token}:{grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:short.access_token}).toString();
 const long=await json(url.href,{method:'GET'},transport);if(typeof long.access_token!=='string'||!long.access_token)throw new Error('Chưa nhận được token dài hạn.');
 const expires=typeof long.expires_in==='number'&&long.expires_in>0?long.expires_in:null;
 if(provider==='threads'&&expires===null)throw new Error('Threads chưa trả thời hạn token hợp lệ.');return {token:long.access_token,expiresIn:expires};
}
export type FacebookPageChoice={id:string;name:string;token:string};
export function appSecretProof(token:string,secret:string){return createHmac('sha256',secret).update(token).digest('hex');}
export async function listFacebookPages(token:string,secret:string,version:string,transport:typeof fetch=fetch){
 const pages:FacebookPageChoice[]=[];let cursor:string|undefined;const deadline=Date.now()+45000;
 for(let batch=0;batch<10;batch++){
  if(Date.now()>deadline)throw new Error('Đọc danh sách Page quá thời gian chờ. Kết nối lại với ít tài sản hơn.');
  const url=new URL(`https://graph.facebook.com/${version}/me/accounts`);url.search=new URLSearchParams({fields:'id,name,access_token',limit:'100',appsecret_proof:appSecretProof(token,secret),...(cursor?{after:cursor}:{})}).toString();
  const value=await json(url.href,{method:'GET',headers:{Authorization:`Bearer ${token}`}},transport);
  if(!Array.isArray(value.data))throw new Error('Không đọc được danh sách Fanpage.');
  for(const page of value.data)if(/^\d+$/.test(String(page.id))&&typeof page.name==='string'&&typeof page.access_token==='string'&&page.access_token)pages.push({id:String(page.id),name:page.name,token:page.access_token});
  if(!value.paging?.next)return pages;
  const after=value.paging?.cursors?.after;if(typeof after!=='string'||!after||after===cursor)throw new Error('Meta trả phân trang không hợp lệ.');cursor=after;
 }
 throw new Error('Danh sách Page quá lớn; cấp quyền cho ít tài sản hơn rồi kết nối lại.');
}
export async function refreshThreadsToken(token:string,transport:typeof fetch=fetch){const url=new URL('https://graph.threads.net/refresh_access_token');url.search=new URLSearchParams({grant_type:'th_refresh_token',access_token:token}).toString();const value=await json(url.href,{method:'GET'},transport);if(typeof value.access_token!=='string'||typeof value.expires_in!=='number'||value.expires_in<=0)throw new Error('Threads chưa cấp token gia hạn hợp lệ.');return {token:value.access_token,expiresIn:value.expires_in as number};}
