import type {SitePage,SiteSection,SiteSettings,NavItem,SiteItem} from '@/server/website/public-site';
import Link from '@/components/common/ProgressLink';
import type {ReactNode} from 'react';
import Image from 'next/image';
import {youtubeVideoId} from '@/client/cms-video.mjs';
import {PublishedVideo} from './PublishedVideo';
import {buildPublishedDirectory} from '@/client/public-discovery.mjs';
import {SiteDiscovery} from './SiteDiscovery';
import {SiteOrbital} from './SiteOrbital';
import {ShifatAlignedSite} from './ShifatAlignedSite';

// Part U: all editorial copy and media in these sections come from published CMS snapshots.
// Decorations are CSS only; there is no client-controlled HTML, embedded script or media URL.
const pathFor=(slug:string)=>slug==='home'?'/':`/site/${slug}`;
const external=(value:string|null)=>value?.startsWith('https://')?value:null;
const mediaFor=(mediaId:string)=>`/api/v1/public/media/${mediaId}`;
const itemsByOrder=(section:SiteSection)=>[...section.items].sort((a,b)=>a.order-b.order);
function ItemMedia({item,priority=false}:{item:SiteItem;priority?:boolean}){
 if(!item.mediaId)return null;
 return <div className="musa-item-image"><Image src={mediaFor(item.mediaId)} alt={item.title||'Published learning media'} width={960} height={680} priority={priority} unoptimized sizes="(max-width:620px) 100vw, (max-width:980px) 50vw, 33vw"/></div>;
}
function ItemVideo({item}:{item:SiteItem}){
 const videoId=youtubeVideoId(item.url);
 return videoId?<PublishedVideo videoId={videoId} title={item.title||'Learning video'}/>:null;
}
function ItemLink({item,children}:{item:SiteItem;children?:ReactNode}){
 const href=external(item.url);
 return href?<a href={href} target="_blank" rel="noopener noreferrer" className="musa-inline-link">{children??'Discover more'} <span aria-hidden="true">↗</span></a>:null;
}
function FeatureCard({item,kind}:{item:SiteItem;kind:string}){
 return <article className={`musa-item musa-item-${kind}`}><ItemMedia item={item}/><ItemVideo item={item}/><div className="musa-item-body">{item.title&&<h3>{item.title}</h3>}{item.description&&<p>{item.description}</p>}<ItemLink item={item}/></div></article>;
}
function Hero({section,brand}:{section:SiteSection;brand:string}){
 const items=itemsByOrder(section),photo=items.find(x=>x.mediaId);
 const actions=items.filter(x=>external(x.url)).slice(0,2);
 return <section className="musa-section musa-hero" id={`section-${section.id}`} aria-label={section.heading||'Introduction'}>
  <div className="musa-section-heading"><p className="musa-eyebrow"><span className="musa-live-dot"/> {brand} · LEARNING</p>{section.heading&&<h1>{section.heading}</h1>}{section.body&&<p className="musa-section-subtitle">{section.body}</p>}
   {actions.length>0&&<div className="musa-hero-actions">{actions.map((action,index)=><a className={`musa-button ${index===0?'musa-button-primary':'musa-button-outline'}`} href={action.url!} target="_blank" rel="noopener noreferrer" key={action.id}>{action.title||'Explore'} <span aria-hidden="true">↗</span></a>)}</div>}
  </div>
  <div className="musa-hero-art" aria-hidden={!photo}>{photo?<div className="musa-hero-photo"><ItemMedia item={photo} priority/></div>:<SiteOrbital brand={brand}/>}</div>
 </section>;
}
function SectionHeading({section,eyebrow}:{section:SiteSection;eyebrow?:string}){
 return <div className="musa-section-heading">{eyebrow&&<p className="musa-eyebrow">{eyebrow}</p>}{section.heading&&<h2>{section.heading}</h2>}{section.body&&<p className="musa-section-subtitle">{section.body}</p>}</div>;
}
function EditorialSection({section,brand}:{section:SiteSection;brand:string}){
 const items=itemsByOrder(section);
 switch(section.kind){
  case 'hero':return <Hero section={section} brand={brand}/>;
  case 'faq':return <section className="musa-section musa-section-faq" id={`section-${section.id}`}><SectionHeading section={section} eyebrow="COMMON QUESTIONS"/><div className="musa-faq">{items.map(i=><details key={i.id}><summary>{i.title}<span aria-hidden="true">+</span></summary><p>{i.description}</p><ItemLink item={i}/></details>)}</div></section>;
  case 'reviews':return <section className="musa-section musa-section-reviews" id={`section-${section.id}`}><SectionHeading section={section} eyebrow="STUDENT VOICES"/><div className="musa-review-grid">{items.map(i=><figure key={i.id} className="musa-review"><blockquote>{i.description}</blockquote><figcaption>{i.title}</figcaption>{i.mediaId&&<ItemMedia item={i}/>}</figure>)}</div></section>;
  case 'gallery':return <section className="musa-section musa-section-gallery" id={`section-${section.id}`}><SectionHeading section={section} eyebrow="MOMENTS & MEMORIES"/><div className="musa-gallery-grid">{items.map(i=><figure className="musa-gallery-tile" key={i.id}>{!youtubeVideoId(i.url)&&<ItemMedia item={i}/>}<ItemVideo item={i}/><figcaption><strong>{i.title}</strong><span>{i.description}</span><ItemLink item={i}/></figcaption></figure>)}</div></section>;
  case 'cta':return <section className="musa-section musa-section-cta" id={`section-${section.id}`}><div className="musa-cta-inner"><SectionHeading section={section}/><div className="musa-cta-buttons">{items.map(i=><ItemLink item={i} key={i.id}>{i.title}</ItemLink>)}</div></div></section>;
  case 'news':case 'materials':case 'academic-calendar':case 'routine':return <section className={`musa-section musa-section-${section.kind}`} id={`section-${section.id}`}><SectionHeading section={section}/><div className="musa-editorial-list">{items.map((i,index)=><article className="musa-editorial-row" key={i.id}><span className="musa-editorial-num">{String(index+1).padStart(2,'0')}</span><div className="musa-editorial-text"><h3>{i.title}</h3>{i.description&&<p>{i.description}</p>}<ItemLink item={i}/></div>{i.mediaId&&<ItemMedia item={i}/>}<ItemVideo item={i}/></article>)}</div></section>;
  case 'results':return <section className="musa-section musa-section-results" id={`section-${section.id}`}><SectionHeading section={section}/><div className="musa-result-grid">{items.map(i=><article className="musa-result-card" key={i.id}><div className="musa-result-spark" aria-hidden="true">✦</div><ItemMedia item={i}/><h3>{i.title}</h3>{i.description&&<p>{i.description}</p>}<ItemLink item={i}/></article>)}</div></section>;
  case 'footer':return <section className="musa-section musa-section-footer" id={`section-${section.id}`}><SectionHeading section={section}/><div className="musa-footer-links">{items.map(i=><ItemLink key={i.id} item={i}>{i.title}</ItemLink>)}</div></section>;
  default:return <section className={`musa-section musa-section-${section.kind}`} id={`section-${section.id}`}><SectionHeading section={section}/>{items.length>0&&<div className="musa-grid">{items.map(i=><FeatureCard key={i.id} item={i} kind={section.kind}/>)}</div>}</section>;
 }
}
export function SiteExperience({page,settings,navigation,related}:{page:SitePage|null;settings:SiteSettings|null;navigation:NavItem[];related?:Record<string,SitePage|null>}){
 // Shifat's Tales page architecture is restored, using published EduCentre CMS content.
 if(process.env.NEXT_PUBLIC_MUSA_REFERENCE_LAYOUT!=='legacy-partx')return <ShifatAlignedSite page={page} settings={settings} navigation={navigation} related={related}/>;
 const name=settings?.settings.siteTitle||'EduCentre',identity=settings?.settings;
 const logoId=typeof identity?.logoMediaId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identity.logoMediaId)?identity.logoMediaId:null;
 const sections=[...(page?.sections??[])].sort((a,b)=>a.order-b.order);
 const nav=navigation.slice(0,12);
 const publishedIndex=buildPublishedDirectory(sections);
 return <div className="musa-site"><a className="musa-skip-link" href="#main-content">Skip to main content</a>
  {identity?.tagline&&<div className="musa-announcement"><span aria-hidden="true">✦</span> {identity.tagline} <span aria-hidden="true">✦</span></div>}
  <header className="musa-site-header"><div className="musa-nav-wrap"><Link href="/" className="musa-logo"><span className="musa-logo-emblem" aria-hidden="true">{logoId?<Image src={mediaFor(logoId)} alt="" width={48} height={48} unoptimized/>:"M"}</span><span className="musa-logo-words"><strong>{name}</strong><small>LEARNING STUDIO</small></span></Link>
   <nav aria-label="Website navigation" className="musa-navigation">{nav.map(x=><Link key={x.slug} href={pathFor(x.slug)}>{x.title}</Link>)}</nav>
   <Link href="/portal" className="musa-header-portal">Student & Teacher sign in <span aria-hidden="true">→</span></Link>
  </div></header>
  <main id="main-content" className="musa-site-main">{page&&<SiteDiscovery entries={publishedIndex}/>} {page?sections.length?sections.map(section=><EditorialSection key={section.id} section={section} brand={name}/>):<div className="musa-empty"><h1>{page.title}</h1><p>More information will be published here soon.</p></div>:<div className="musa-empty"><p className="musa-eyebrow">{name}</p><h1>Our learning website is coming together.</h1><p>Published content will appear here when it is ready.</p></div>}</main>
  <footer id="contact-info" className="musa-footer"><div className="musa-footer-inner"><div><div className="musa-footer-brand">{name}<span aria-hidden="true">✦</span></div>{identity?.tagline&&<p>{identity.tagline}</p>}{identity?.footerText&&<p className="musa-footnote">{identity.footerText}</p>}</div><div className="musa-footer-contact"><strong>Get in touch</strong>{identity?.contactEmail&&<a href={`mailto:${identity.contactEmail}`}>{identity.contactEmail}</a>}{identity?.contactPhone&&<a href={`tel:${identity.contactPhone}`}>{identity.contactPhone}</a>}<Link href="/portal">Student & Teacher portal ↗</Link></div></div><div className="musa-footer-bottom">© {new Date().getFullYear()} {name}. All rights reserved. <a href="#main-content" className="musa-back-top">Back to top ↑</a></div></footer>
 </div>;
}
