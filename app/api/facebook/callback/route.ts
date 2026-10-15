import {callbackSocial} from '@/lib/social-oauth-handlers';
export const runtime='nodejs';export const maxDuration=120;
export async function GET(request:Request){return callbackSocial(request,'facebook');}
