import { getSiteSettings } from '@/lib/site-settings-server';
import { interpolate,type SiteSettings } from '@/lib/site-settings';
export default async function PublicPolicy({page}:{page:keyof SiteSettings['pages']}){
 const {settings}=await getSiteSettings();const entry=settings.pages[page];
 return <><p className="public-kicker">{settings.name} · Thông tin ứng dụng</p><h1>{interpolate(entry.title,settings)}</h1><p className="public-date">Cập nhật: {settings.policyDate}</p>{interpolate(entry.body,settings).split(/\n/).filter(line=>line.trim()).map((line,index)=>line.startsWith('## ')?<h2 key={index}>{line.slice(3)}</h2>:<p key={index} style={{whiteSpace:'pre-wrap'}}>{line.startsWith('- ')?'• '+line.slice(2):line}</p>)}<p>Liên hệ: <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p></>;
}
