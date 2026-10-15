import {authorize,failure} from '@/lib/content-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await authorize(request);const keys=['SUPABASE_SERVICE_ROLE_KEY','CONTENT_ADMIN_USER_ID','OPENAI_API_KEY','OPENAI_MODEL','FACEBOOK_PAGE_ID','FACEBOOK_PAGE_ACCESS_TOKEN','META_GRAPH_VERSION','THREADS_USER_ID','THREADS_ACCESS_TOKEN'];return Response.json({configured:Object.fromEntries(keys.map(k=>[k,!!process.env[k]?.trim()]))},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
