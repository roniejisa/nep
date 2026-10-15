import {getSocialConnection,updateSocialConnection,disconnectSocial} from '@/lib/social-oauth-handlers';
export const runtime='nodejs';
export async function GET(request:Request){return getSocialConnection(request,'facebook');}
export async function POST(request:Request){return updateSocialConnection(request,'facebook');}
export async function DELETE(request:Request){return disconnectSocial(request,'facebook');}
