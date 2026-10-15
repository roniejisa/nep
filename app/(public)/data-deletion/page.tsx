import PublicPolicy from '@/components/public-policy';
import {getSiteSettings} from '@/lib/site-settings-server';
import {interpolate} from '@/lib/site-settings';
export const dynamic='force-dynamic';
export async function generateMetadata(){const {settings}=await getSiteSettings();return {title:interpolate(settings.pages['data-deletion'].title,settings)+' | '+settings.name};}
export default function Page(){return <PublicPolicy page="data-deletion"/>;}
