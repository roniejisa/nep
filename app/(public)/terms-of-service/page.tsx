import PublicPolicy from '@/components/public-policy';
import {getSiteSettings} from '@/lib/site-settings-server';
import {interpolate} from '@/lib/site-settings';
export const dynamic='force-dynamic';
export async function generateMetadata(){const {settings}=await getSiteSettings();return {title:interpolate(settings.pages['terms-of-service'].title,settings)+' | '+settings.name};}
export default function Page(){return <PublicPolicy page="terms-of-service"/>;}
