import {database,env,failure} from '@/lib/content-server';
import {cronAuthorized} from '@/lib/automation';
import {runProductImages} from '@/lib/product-image-worker';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
export async function POST(request:Request){if(!cronAuthorized(request.headers.get('authorization')))return Response.json({error:'Unauthorized'},{status:401});try{return Response.json(await runProductImages(database(),env('CONTENT_ADMIN_USER_ID')),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export const GET=POST;
