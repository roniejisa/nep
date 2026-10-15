import defaults from './site-defaults.json';
export type SiteSettings = typeof defaults;
export const defaultSettings: SiteSettings = defaults;
export function validateSettings(value: unknown): SiteSettings {
 if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Cấu hình không hợp lệ.');
 const raw=value as Record<string,unknown>;
 const out=structuredClone(defaults);
 function string(value:unknown,max:number,label:string){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label}: bắt buộc, tối đa ${max} ký tự.`);return value.trim();}
 for(const key of ['name','tagline','description','contactEmail','policyDate','footer'] as const)out[key]=string(raw[key],key==='description'?500:200,key);
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.contactEmail))throw new Error('Email liên hệ chưa hợp lệ.');
 for(const group of ['headings','descriptions'] as const){
  const entries=raw[group] as Record<string,unknown>|undefined;
  for(const key of ['products','images','content','setup'] as const)out[group][key]=string(entries?.[key],500,`${group}.${key}`);
 }
 const pages=raw.pages as Record<string,{title?:unknown;body?:unknown}>|undefined;
 for(const key of ['privacy-policy','terms-of-service','data-deletion','contact'] as const){out.pages[key]={title:string(pages?.[key]?.title,200,key),body:string(pages?.[key]?.body,20000,key)};}
 return out; // allowlist: never persist arbitrary fields or secret keys
}
export function interpolate(text:string,settings:SiteSettings){return text.replaceAll('{siteName}',settings.name).replaceAll('{contactEmail}',settings.contactEmail);}
