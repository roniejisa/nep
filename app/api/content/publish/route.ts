import {explainError} from '@/lib/operation-error';
import {authorize,failure,readBody} from '@/lib/content-server';
import {publishContent} from '@/lib/content-publish';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){let context:Awaited<ReturnType<typeof authorize>>|undefined;try{context=await authorize(request);return Response.json(await publishContent(context.db,context.user.id,await readBody(request)));}catch(e){if(context)await context.db.from('affiliate_automation_errors').insert({owner_id:context.user.id,...explainError(e,'publish')});return failure(e);}}
