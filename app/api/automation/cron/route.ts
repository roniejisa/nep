import {cronAuthorized,runAutomation} from '@/lib/automation';
import {failure} from '@/lib/content-server';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
export async function POST(request:Request){if(!cronAuthorized(request.headers.get('authorization')))return Response.json({error:'Unauthorized'},{status:401});try{return Response.json(await runAutomation(),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export const GET=POST;
