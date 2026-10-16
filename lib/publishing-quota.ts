import type {Channel} from './content-rules.ts';
import {metaRequest,type SocialTarget} from './social-publish.ts';
import {OperationError} from './operation-error.ts';

// Read the account's current Meta quota; never compile a posts/day ceiling here.
export async function assertPublishingQuota(channel:Channel,target:SocialTarget){
 if(channel==='facebook')return; // Page API enforces its own API/abuse limits.
 const host=channel==='threads'?'https://graph.threads.net/v1.0':target.instagramLogin==='instagram'?`https://graph.instagram.com/${target.version}`:`https://graph.facebook.com/${target.version}`;
 const endpoint=channel==='threads'?'threads_publishing_limit':'content_publishing_limit';
 const query=new URLSearchParams({fields:'quota_usage,config'});
 if(target.appSecretProof)query.set('appsecret_proof',target.appSecretProof);
 const result=await metaRequest(`${host}/${target.id}/${endpoint}?${query}`,target.token);
 const quota=result.data?.[0],used=quota?.quota_usage,total=quota?.config?.quota_total;
 if(!Number.isFinite(used)||!Number.isFinite(total)||used<0||total<0)throw new OperationError('Meta chưa trả đủ hạn mức đăng của tài khoản. Kiểm tra quyền và kết nối.','meta');
 if(used>=total)throw new OperationError(`Meta báo hết hạn mức đăng (${used}/${total}). Chờ hạn mức của tài khoản phục hồi.`,'rate_limit');
}
