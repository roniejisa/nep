import {authorize,failure,readBody} from '@/lib/content-server';
import {publishContent} from '@/lib/content-publish';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){try{const {db,user}=await authorize(request);return Response.json(await publishContent(db,user.id,await readBody(request)));}catch(e){return failure(e);}}
