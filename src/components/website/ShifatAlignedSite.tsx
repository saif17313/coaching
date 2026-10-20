import {SitePresentation} from './SitePresentation';
import {PublishedRefresh} from './PublishedRefresh';
import {publicRevisionFingerprint,type SitePage,type SiteSettings,type NavItem} from '@/server/website/public-site';
export async function ShifatAlignedSite({page,settings,navigation,related={}}:{page:SitePage|null;settings:SiteSettings|null;navigation:NavItem[];related?:Record<string,SitePage|null>}){
 const fingerprint=await publicRevisionFingerprint();
 const watched=JSON.stringify({[page?.slug||'home']:page?.revision??null,...Object.fromEntries(Object.entries(related).map(([slug,source])=>[slug,source?.revision??null]))});
 return <><PublishedRefresh slug={page?.slug||'home'} revision={page?.revision??null} settingsRevision={settings?.revision??null} watched={watched} fingerprint={fingerprint}/><SitePresentation page={page} settings={settings} navigation={navigation} related={related}/></>;
}
