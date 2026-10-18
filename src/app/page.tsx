import {SiteExperience} from '@/components/website/SiteExperience';
import {publicNavigation,publicPage,publicSettings} from '@/server/website/public-site';
export const dynamic='force-dynamic';
export default async function HomePage(){const [page,settings,navigation]=await Promise.all([publicPage('home'),publicSettings(),publicNavigation()]);return <SiteExperience page={page} settings={settings} navigation={navigation}/>;}
