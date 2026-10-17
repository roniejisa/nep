import {authorize,failure} from '@/lib/content-server';
import {applyProductBulk,bulkInput} from '@/lib/product-bulk';
export const runtime='nodejs';export const maxDuration=300;export const dynamic='force-dynamic';
export async function POST(request:Request){try{
 const {db,user}=await authorize(request);
 if(Number(request.headers.get('content-length'))>60000)throw new Error('Yêu cầu quá dài.');
 const text=await request.text();if(Buffer.byteLength(text)>60000)throw new Error('Yêu cầu quá dài.');
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Yêu cầu không hợp lệ.');
 return Response.json(await applyProductBulk(db,user.id,bulkInput(value)),{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return failure(error);}}
