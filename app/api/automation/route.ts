import {authorize,failure,readBody} from '@/lib/content-server';
import {automationSettings} from '@/lib/automation-rules';
import {automationTarget} from '@/lib/automation';
import {configuredProviders} from '@/lib/ai-provider';
import {requestPage} from '@/lib/pagination';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const {db,user}=await authorize(request),url=new URL(request.url),jobPage=requestPage(url.searchParams.get('jobsPage')),errorPage=requestPage(url.searchParams.get('errorsPage')),size=6;
 const [settingsResult,jobsResult,errorsResult]=await Promise.all([
 db.from('affiliate_automation_settings').select('*').eq('owner_id',user.id).maybeSingle(),
 db.from('affiliate_automation_jobs').select('*',{count:'exact'}).eq('owner_id',user.id).order('created_at',{ascending:false}).order('id').range((jobPage-1)*size,jobPage*size-1),
 db.from('affiliate_automation_errors').select('*',{count:'exact'}).eq('owner_id',user.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).order('id').range((errorPage-1)*size,errorPage*size-1)]);
 if(settingsResult.error||jobsResult.error||errorsResult.error)throw new Error('Chưa đọc được dữ liệu tự động hóa. Kiểm tra các migration trong hướng dẫn nâng cấp.');
 return Response.json({settings:settingsResult.data,jobs:jobsResult.data,errors:errorsResult.data,jobsTotal:jobsResult.count,errorsTotal:errorsResult.count,pageSize:size,cronConfigured:(process.env.CRON_SECRET?.trim().length||0)>=32},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
export async function POST(request:Request){try{const {db,user}=await authorize(request);const input=await readBody(request);
 if(input.action==='pause'){const {error}=await db.from('affiliate_automation_settings').update({enabled:false,updated_at:new Date().toISOString()}).eq('owner_id',user.id);if(error)throw new Error('Không tắt được lịch.');return Response.json({paused:true});}
 const cfg=automationSettings(input),targets:Record<string,string>={};
 if(cfg.selection_mode==='products'){const {data,error}=await db.from('affiliate_products').select('id').eq('owner_id',user.id).in('id',cfg.selected_products);if(error||data?.length!==cfg.selected_products.length)throw new Error('Có sản phẩm đã bị xóa hoặc không thuộc tài khoản.');}
 if(cfg.enabled){if(input.autoPublishConsent!==true)throw new Error('Xác nhận cho phép tự đăng trước khi lưu.');if((process.env.CRON_SECRET?.trim().length||0)<32)throw new Error('Thiếu CRON_SECRET trên Vercel.');if(!configuredProviders()[cfg.provider as keyof ReturnType<typeof configuredProviders>])throw new Error('Chưa có khóa AI đã chọn.');for(const channel of cfg.channels.filter(c=>c!=='threads'||cfg.format_mode!=='reel'||Object.values(cfg.slot_formats).includes('feed'))){const target=await automationTarget(db,user.id,channel);targets[channel]=target.id;}}
 const {error}=await db.from('affiliate_automation_settings').upsert({...cfg,targets,owner_id:user.id,updated_at:new Date().toISOString()});if(error)throw new Error('Không lưu được lịch. Chạy reels.sql sau automation-unrestricted.sql và các migration trước đó.');return Response.json({saved:true});
 }catch(e){return failure(e);}}
