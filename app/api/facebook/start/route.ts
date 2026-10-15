import {startSocial} from '@/lib/social-oauth-handlers';
export const runtime='nodejs';
export async function POST(request:Request){return startSocial(request,'facebook');}
