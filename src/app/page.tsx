import {SiteExperience} from '@/components/website/SiteExperience';
import {publicNavigation,publicPage,publicSettings} from '@/server/website/public-site';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 const page=await publicPage('home');
 return page?{title:page.seoTitle,description:page.seoDescription,robots:{index:true,follow:true}}:{title:'EduCentre | Learning Studio',robots:{index:false,follow:false}};
}
export default async function HomePage(){const [page,settings,navigation]=await Promise.all([publicPage('home'),publicSettings(),publicNavigation()]);const slugs=['about','courses','results','reviews','news-events','gallery'];const loaded=await Promise.all(slugs.map(slug=>publicPage(slug)));const related=Object.fromEntries(slugs.map((slug,i)=>[slug,loaded[i]]));return <SiteExperience page={page} settings={settings} navigation={navigation} related={related}/>;}
