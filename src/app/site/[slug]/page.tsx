import {SiteExperience} from '@/components/website/SiteExperience';
import {publicNavigation,publicPage,publicSettings} from '@/server/website/public-site';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const p=await publicPage(slug);return p?{title:p.seoTitle,description:p.seoDescription,robots:{index:true,follow:true}}:{title:'Not found',robots:{index:false,follow:false}};}
export default async function SiteContentPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const [page,settings,navigation]=await Promise.all([publicPage(slug),publicSettings(),publicNavigation()]);if(!page)notFound();return <SiteExperience page={page} settings={settings} navigation={navigation}/>;}
