import {cache} from 'react';
import { createClient } from '@supabase/supabase-js';
import { defaultSettings,validateSettings } from './site-settings';
export const getSiteSettings=cache(async function getSiteSettings(){
 try {
  const client=createClient('https://aegbygaxnynjfkmogpbg.supabase.co','sb_publishable_4EnHkrEczA-ljw2n-5nAVQ_xPPQ3f3n',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(4000)})}});
  const {data,error}=await client.from('affiliate_site_settings').select('value').eq('id',1).maybeSingle();
  if(error||!data)return {settings:defaultSettings,fallback:true};
  return {settings:validateSettings(data.value),fallback:false};
 }catch{return {settings:defaultSettings,fallback:true};}
});
