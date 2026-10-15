import {authorize,failure,readBody} from '@/lib/content-server';
import {generateContent} from '@/lib/content-generate';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){try{const {db,user}=await authorize(request);return Response.json(await generateContent(db,user.id,await readBody(request)));}catch(e){return failure(e);}}
