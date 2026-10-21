import {publicPageContent,publicText} from '@/client/public-content-policy.mjs';
import './premium-public.css';
import {Fragment,type ReactNode} from 'react';
import Link from 'next/link';
import {PublicCmsLinks} from './PublicCmsLinks';
import {HOME_SECTIONS,resolveHomeSection,homeSectionMap,orderHomeKeys} from '@/client/website-composition.mjs';
import {InvitationRedirect} from '../portal/InvitationRedirect';
import {TypedContent,ItemDetails} from './TypedContent';
import {safeContentUrl} from '@/client/cms-fields.mjs';
import {ScientificScene} from './ScientificScene';
import Image from './SiteImage';
import type {NavItem,SiteItem,SitePage,SiteSection,SiteSettings} from '@/server/website/public-site';
import {PublishedVideo} from './PublishedVideo';
import {youtubeVideoId} from '@/client/cms-video.mjs';
import {SiteDiscovery} from './SiteDiscovery';
import {ReferenceCourseCarousel} from './ReferenceCourseCarousel';
import {buildPublishedDirectory} from '@/client/public-discovery.mjs';
import {publicItemLink} from '@/client/public-item-links.mjs';

// Shifat's Tales public information architecture and homepage sequence, with independent EduCentre styling.
// All site-specific claims, images and links below come from published CMS snapshots.
const href=(slug:string)=>slug==='home'?'/':`/site/${slug}`;
const ordered=(page:SitePage|null)=>(page?.sections??[]).slice().sort((a,b)=>a.order-b.order);
const visibleItems=(section?:SiteSection)=>section?.items.slice().sort((a,b)=>a.order-b.order)??[];
const ofKind=(page:SitePage|null,kind:string)=>ordered(page).find(s=>s.kind===kind&&s.sectionKey)??ordered(page).find(s=>s.kind===kind);
function featuredSection(page:SitePage,key:string,field:string,source:SitePage|null|undefined,kind:string){
 const selection=ordered(page).find(s=>s.sectionKey===key),catalog=ofKind(source??null,kind);
 if(!selection)return catalog;
 const raw=selection.content?.[field],ids=Array.isArray(raw)?raw:[];
 const items=ordered(source??null).flatMap(s=>s.items),chosen=ids.flatMap(id=>{const item=items.find(x=>x.id===id);return item?[item]:[];});
 return {...selection,sectionKey:catalog?.sectionKey,content:catalog?.content,items:chosen};
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function Media({item,large=false}:{item:SiteItem;large?:boolean}){
 if(!item.mediaId||!uuid.test(item.mediaId))return <span className="tale-media-pattern" aria-hidden="true"><i/><b/><em/></span>;
 return <Image unoptimized src={`/api/v1/public/media/${item.mediaId}`} alt={item.title||'Published gallery image'} width={large?960:560} height={large?720:420} sizes={large?'(max-width: 850px) 100vw, 50vw':'(max-width: 680px) 100vw, 33vw'} className="tale-media-picture"/>;
}
function Card({item,index=0,kind='cards',section}:{item:SiteItem;index?:number;kind?:string;section?:SiteSection}){
 const video=youtubeVideoId(item.url),outgoing=item.url?.startsWith('https://')&&!video?item.url:null;
 return <article id={`item-${item.id.toLowerCase()}`} className={`tale-card tale-card-${kind}`}>
  {kind==='gallery'||item.mediaId?<div className="tale-card-media"><Media item={item}/></div>:<span className="tale-card-symbol" aria-hidden="true">{['✦','◈','◇','✳','✧'][index%5]}</span>}
  <div className="tale-card-copy">{item.title&&<h3>{item.title}</h3>}{item.description&&<p>{item.description}</p>}{section&&item.metadata&&<ItemDetails section={section} value={item.metadata}/>}{['news','gallery'].includes(kind)&&publicItemLink(kind,item.id)&&<Link href={publicItemLink(kind,item.id)!}>View on page →</Link>}
  {video?<PublishedVideo videoId={video} title={item.title||'Published class video'}/>:outgoing?<a href={outgoing} target="_blank" rel="noopener noreferrer">Explore more <span aria-hidden="true">↗</span></a>:null}</div>
 </article>;
}
function Cards({section,kind='cards',limit}:{section?:SiteSection;kind?:string;limit?:number}){
 if(!section)return null;
 const items=visibleItems(section).slice(0,limit??30);
 return <section className={`tale-block tale-block-${kind}`} id={`section-${section.id}`}>
  <div className="tale-section-title"><span className="tale-eyebrow">{kind==='courses'?'LEARNING PROGRAMS':kind==='gallery'?'OUR MOMENTS':kind==='news'?'WHAT IS NEW':kind==='reviews'?'STUDENT VOICES':kind==='results'?'ACHIEVEMENTS':'WHY LEARN WITH US'}</span><h2>{section.heading}</h2>{section.body&&<p>{section.body}</p>}</div><TypedContent section={section}/>
  {items.length>0&&(kind==='courses'?<ReferenceCourseCarousel items={items}/>:<div className={`tale-cards tale-cards-${kind}`}>{items.map((i,index)=><Card item={i} index={index} kind={kind} section={section} key={i.id}/>)}</div>)}
 </section>;
}
function InfoSection({section,slug}:{section:SiteSection;slug:string}){
 if(section.sectionKey)return <section className={`tale-block tale-info tale-typed-section`} id={`section-${section.id}`}><div className="tale-section-title"><h2>{section.heading}</h2>{section.body&&<p>{section.body}</p>}</div><TypedContent section={section}/>{section.items.length>0&&<div className="tale-cards">{section.items.map((item,index)=><Card key={item.id} item={item} index={index} kind={section.kind} section={section}/>)}</div>}</section>;
 if(section.kind==='hero')return <section className="tale-interior-hero" id={`section-${section.id}`}><span className="tale-eyebrow">EDUCENTRE / {slug.replaceAll('-',' ').toUpperCase()}</span><h1>{section.heading}</h1><p>{section.body}</p><span className="tale-interior-decoration" aria-hidden="true">✦</span></section>;
 if(section.kind==='faq')return <section id={`section-${section.id}`} className="tale-block tale-faq"><div className="tale-section-title"><span className="tale-eyebrow">HELPFUL ANSWERS</span><h2>{section.heading}</h2>{section.body&&<p>{section.body}</p>}</div><TypedContent section={section}/><div className="tale-faq-list">{visibleItems(section).map(x=><details key={x.id}><summary>{x.title}<span>+</span></summary><p>{x.description}</p></details>)}</div></section>;
 if(section.kind==='rich-text'||section.kind==='contact'||section.kind==='materials'||section.kind==='routine'||section.kind==='academic-calendar')return <section id={`section-${section.id}`} className="tale-block tale-info"><div className="tale-section-title"><span className="tale-eyebrow">DISCOVER MORE</span><h2>{section.heading}</h2>{section.body&&<p>{section.body}</p>}</div><TypedContent section={section}/><div className="tale-info-rows">{visibleItems(section).map((x,i)=><article key={x.id}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{x.title}</h3><p>{x.description}</p></div>{x.url?.startsWith('https://')&&<a href={x.url} target="_blank" rel="noopener noreferrer">Visit ↗</a>}</article>)}</div></section>;
 if(section.kind==='cta'||section.kind==='footer')return <section id={`section-${section.id}`} className="tale-block tale-banner"><h2>{section.heading}</h2>{section.body&&<p>{section.body}</p>}<div className="tale-banner-actions">{visibleItems(section).filter(x=>x.url?.startsWith('https://')).map(x=><a key={x.id} href={x.url!} rel="noopener noreferrer" target="_blank">{x.title} ↗</a>)}</div></section>;
 return <Cards section={section} kind={section.kind}/>;
}
const academic=[['academic-calendar','Academic calendar'],['class-routine','Class routine'],['courses','Courses'],['projects','Projects'],['materials','Materials'],['results','Results'],['reviews','All reviews']] as const;
const topLinks=[['home','Home'],['about','About'],['gallery','Gallery'],['news-events','News & events'],['contact','Contact me']] as const;
function Header({siteTitle,navigation,logoId,custom=[]}:{siteTitle:string;navigation:NavItem[];logoId:string|null;custom:{label:string;url:string}[]}){
 const available=new Set(navigation.map(n=>n.slug));
 const basic=(slug:string,label:string)=>available.has(slug)?<Link href={href(slug)} key={slug}>{navigation.find(x=>x.slug===slug)?.title||label}</Link>:null;
 return <header className="tale-header"><div className="tale-header-inner">
   <Link className="tale-brand" href="/"><span className="tale-brand-mark">{logoId?<Image unoptimized src={`/api/v1/public/media/${logoId}`} alt="" width={46} height={46}/>:<span>E</span>}</span><span><strong>{siteTitle}</strong><small>ACADEMIC CARE · STUDENT SUCCESS</small></span></Link>
   <nav className="tale-desktop-nav" aria-label="Main website navigation">{custom.length>0?custom.map(link=><Link key={link.url+link.label} href={link.url}>{link.label}</Link>):<>{basic('home','Home')}{basic('about','About')}
    <details className="tale-nav-dropdown"><summary>Academic <span aria-hidden="true">⌄</span></summary><div className="tale-nav-menu">{academic.filter(([slug])=>available.has(slug)).map(([slug,label])=><Link key={slug} href={href(slug)}>{label}<span>↗</span></Link>)}</div></details>
    {basic('gallery','Gallery')}{basic('news-events','News & Events')}{basic('contact','Contact Me')}
   </>}</nav>
   <Link className="tale-account" href="/portal">My dashboard <span>↗</span></Link>
   <details className="tale-mobile-nav"><summary aria-label="Toggle website menu">☰</summary><div className="tale-mobile-menu">{custom.length>0?custom.map(link=><Link key={link.url+link.label} href={link.url}>{link.label}</Link>):<>{topLinks.map(([slug,label])=>basic(slug,label))}<span>Academic</span>{academic.map(([slug,label])=>basic(slug,label))}</>}<Link className="tale-mobile-dashboard" href="/portal">Student / Teacher dashboard ↗</Link></div></details>
  </div></header>;
}
function Home({page,related}:{page:SitePage;related:Record<string,SitePage|null>}){
 const mapped=(key:string)=>resolveHomeSection(key,page,related)?.section??undefined;
 const hero=mapped('HOME_HERO'); const heroFields=hero?.content??{};
 const heroText=(key:string)=>typeof heroFields[key]==='string'?heroFields[key] as string:''; const stats=mapped('HOME_STATS'); const featured=featuredSection(page,'HOME_FEATURED_COURSES','selectedCourseIds',related.courses,'courses')??ofKind(page,'courses');
 const why=mapped('HOME_WHY_CHOOSE'),teacher=mapped('HOME_TEACHER'),achievements=mapped('HOME_TOP_STUDENTS'),videoSection=mapped('HOME_YOUTUBE_CLASSES');
 const results=featuredSection(page,'HOME_STUDENT_SUCCESS','selectedStudentIds',related.results,'results'),reviews=featuredSection(page,'HOME_TESTIMONIALS','selectedTestimonialIds',related.reviews,'reviews'),gallery=featuredSection(page,'HOME_GALLERY','selectedAlbumIds',related.gallery,'gallery');
 const newsSelection=ordered(page).find(s=>s.sectionKey==='HOME_NEWS_EVENTS'),newsIds=newsSelection?.content;
 const news=newsSelection?featuredSection({...page,sections:page.sections.map(s=>s===newsSelection?{...s,content:{...s.content,selectedRightIds:[...(newsIds?.featuredId?[newsIds.featuredId]:[]),...(Array.isArray(newsIds?.selectedRightIds)?newsIds.selectedRightIds:[])]}}:s)},'HOME_NEWS_EVENTS','selectedRightIds',related['news-events'],'news'):ofKind(related['news-events'],'news');
 const videos=ordered(page).flatMap(x=>visibleItems(x)).filter(x=>youtubeVideoId(x.url));
 const heroAction=visibleItems(hero).find(item=>item.url?.startsWith('https://'));
 const heroMedia=visibleItems(hero).find(item=>item.mediaId&&uuid.test(item.mediaId));
 const mentorFields=teacher?.content??{};
 const mentorMedia=visibleItems(teacher).find(item=>item.mediaId&&uuid.test(item.mediaId));
 const renderedHomeIds=new Set(HOME_SECTIONS.flatMap(definition=>{const row=resolveHomeSection(definition.key,page,related);return row?.sourceSlug==='home'&&row.section?[row.section.id]:[];}));
 const blocks:Record<string,ReactNode>={
  HOME_HERO:(<section className={`tale-home-hero ${heroMedia?'tale-uses-published-hero':'tale-uses-local-hero'} ${heroFields.enableMotion===false?'tale-motion-disabled':''}`} id={hero?`section-${hero.id}`:undefined} aria-label="Featured introduction"><div className="tale-home-hero-inner"><div className="tale-home-hero-copy"><span className="tale-pill">{heroText('tagline')||'LEARN WITH PURPOSE'}</span><h1>{heroText('headline')||hero?.heading||page.title}{heroText('highlightedText')&&<em> {heroText('highlightedText')}</em>}</h1>{(heroText('description')||hero?.body)&&<p>{heroText('description')||hero?.body}</p>}{Array.isArray(heroFields.features)&&<ul>{heroFields.features.map((feature,i)=><li key={i}>{String(feature)}</li>)}</ul>}<div className="tale-hero-links">{heroText('primaryCtaUrl')&&safeContentUrl(heroText('primaryCtaUrl'))?<Link className="tale-action" href={heroText('primaryCtaUrl')}>{heroText('primaryCtaLabel')||'Explore courses'} &rarr;</Link>:heroAction?<a className="tale-action" href={heroAction.url!} target="_blank" rel="noopener noreferrer">{heroAction.title||'Explore courses'} <span>↗</span></a>:<Link className="tale-action" href={href('courses')}>Explore courses <span>↗</span></Link>}<Link className="tale-action-outlined" href={heroText('secondaryCtaUrl')&&safeContentUrl(heroText('secondaryCtaUrl'))?heroText('secondaryCtaUrl'):href('about')}>{heroText('secondaryCtaLabel')||'Meet the mentor'} <span aria-hidden="true">&rarr;</span></Link></div><div className="tale-hero-trust"> <span>✳</span> Structured academic support <i/> <span>✦</span> Guided learning</div></div>
   <div className="tale-hero-visual" aria-label="Decorative books and learning illustration"><div className="tale-visual-orbit"><div className="tale-visual-disc"/><span className="tale-orbit-ring tale-orbit-ring-one" aria-hidden="true"/><span className="tale-orbit-ring tale-orbit-ring-two" aria-hidden="true"/>{heroText('teacherImage')?<div className="tale-visual-published"><Image unoptimized src={`/api/v1/public/media/${heroText('teacherImage')}`} alt={heroText('teacherName')||'Published teacher photograph'} width={640} height={640}/></div>:heroMedia?<div className="tale-visual-published"><Media item={heroMedia} large/></div>:<div className="tale-visual-book"><Image src="/images/musa-education-hero.png" alt="" fill priority sizes="(max-width: 700px) 320px, 550px" className="tale-hero-illustration"/><span className="tale-hero-illustration-fallback">LEARN · GROW</span></div>}<ScientificScene enabled={heroFields.enableMotion!==false}/><span className="tale-visual-spark spark-one">✳</span><span className="tale-visual-spark spark-two">✦</span><span className="tale-visual-spark spark-three">✧</span></div><div className="tale-floating-note"><span>{heroText('teacherName')||'Learning with direction'}{heroText('teacherTitle')&&<small> / {heroText('teacherTitle')}</small>}{heroText('teacherSubtitle')&&<small> / {heroText('teacherSubtitle')}</small>}</span></div></div>
  </div></section>),

  HOME_STATS:(stats&&<section className="tale-trust-strip" id={`section-${stats.id}`} aria-label="Learning highlights">{stats.sectionKey?<TypedContent section={stats}/>:visibleItems(stats).slice(0,4).map((x,i)=><div key={x.id}><span aria-hidden="true">{['✦','◆','✳','◇'][i]}</span><div><strong>{x.title}</strong><small>{x.description}</small></div></div>)}</section>),
  HOME_FEATURED_COURSES:(featured&&<div className="tale-section-wrap"><Cards section={featured} kind="courses" limit={5}/><div className="tale-centered-link"><Link href={href('courses')}>View all courses <span>→</span></Link></div></div>),
  HOME_WHY_CHOOSE:(why&&<div className="tale-soft-panel"><Cards section={why} kind="why" limit={4}/></div>),
  HOME_TEACHER:(teacher&&<section className="tale-mentor" id="teacher"><div className="tale-mentor-portrait">{typeof mentorFields.teacherImage==='string'&&uuid.test(mentorFields.teacherImage)?<div className="tale-mentor-image"><Image unoptimized src={`/api/v1/public/media/${mentorFields.teacherImage}`} alt={typeof mentorFields.teacherName==='string'?mentorFields.teacherName:'Published mentor photograph'} width={640} height={640}/></div>:mentorMedia?<div className="tale-mentor-image"><Media item={mentorMedia} large/></div>:<span className="tale-mentor-orb" aria-hidden="true">✦</span>}<span className="tale-mentor-tag">THE MENTOR BEHIND THE JOURNEY</span></div><div><span className="tale-eyebrow">MEET THE MENTOR</span><h2>{teacher.heading}</h2><TypedContent section={teacher} omit={['teacherImage']}/>{!mentorFields.teacherBio&&teacher.body&&<p>{teacher.body}</p>}{visibleItems(teacher).slice(0,3).map(x=><div className="tale-mentor-point" key={x.id}><span>✓</span><div><strong>{x.title}</strong><p>{x.description}</p></div></div>)}<Link className="tale-text-link" href={href('about')}>Discover the story →</Link></div></section>),
  HOME_TOP_STUDENTS:(achievements&&<div className="tale-top-students"><TypedContent section={achievements}/><div className="tale-compact-label">✦ STUDENT ACHIEVEMENT SPOTLIGHT</div><div className="tale-top-student-grid">{visibleItems(achievements).slice(0,3).map((item,i)=><div key={item.id}><span>#{String(i+1).padStart(2,'0')}</span><strong>{item.title}</strong><small>{item.description}</small></div>)}</div></div>),
  HOME_STUDENT_SUCCESS:(results&&<Cards section={results} kind="results" limit={5}/>),
  HOME_YOUTUBE_CLASSES:(<section id={videoSection?`section-${videoSection.id}`:"homepage-video-classes"} className="tale-block tale-video-showcase"><div className="tale-section-title"><span className="tale-eyebrow">WATCH AND LEARN</span><h2>{videoSection?.heading||'Video classes'}</h2></div>{videoSection?.sectionKey==='HOME_YOUTUBE_CLASSES'&&Array.isArray(videoSection.content?.classes)&&videoSection.content.classes.length>0?<TypedContent section={videoSection}/>:videos.length>0?<div className="tale-cards tale-cards-videos">{videos.map(x=><Card item={x} kind="videos" key={x.id}/>)}</div>:<div className="tale-unpublished-note">Video lessons will appear here when available.</div>}</section>),
  HOME_TESTIMONIALS:(reviews&&<div className="tale-soft-panel"><Cards section={reviews} kind="reviews" limit={6}/><div className="tale-centered-link"><Link href={href('reviews')}>All student perspectives →</Link></div></div>),
  HOME_NEWS_EVENTS:(news&&<Cards section={news} kind="news" limit={3}/>),
  HOME_GALLERY:(gallery&&<div className="tale-soft-panel tale-last-gallery"><Cards section={gallery} kind="gallery" limit={4}/><div className="tale-centered-link"><Link href={href('gallery')}>Explore gallery →</Link></div></div>),
 };
 for(const section of ordered(page).filter(s=>s.sectionKey!=='HOME_LAYOUT'&&!renderedHomeIds.has(s.id)))blocks['section:'+section.id]=<InfoSection section={section} slug="home" key={section.id}/>;
 return <>{orderHomeKeys(Object.keys(blocks),page,related).map(key=><Fragment key={key}>{blocks[key]}</Fragment>)}</>;
}
export function SitePresentation({page:rawPage,settings:rawSettings,navigation,related:rawRelated={},preview=false}:{page:SitePage|null;settings:SiteSettings|null;navigation:NavItem[];related?:Record<string,SitePage|null>;preview?:boolean}){
 const page=publicPageContent(rawPage),related=Object.fromEntries(Object.entries(rawRelated).map(([key,value])=>[key,publicPageContent(value)]));
 const settings=rawSettings?{...rawSettings,settings:{...rawSettings.settings,siteTitle:rawSettings.settings.siteTitle.replace(/\s+Demo$/i,''),tagline:publicText(rawSettings.settings.tagline),footerText:publicText(rawSettings.settings.footerText),contactEmail:/@(?:example\.(?:invalid|com)|test\.com)$/i.test(rawSettings.settings.contactEmail)?'':rawSettings.settings.contactEmail}}:null;
 const name=settings?.settings.siteTitle||'EduCentre';
 const rawLogo=settings?.settings.logoMediaId;const logoId=rawLogo&&uuid.test(rawLogo)?rawLogo:null;
 const sections=ordered(page);const isHome=page?.slug==='home';
 const footer=ordered(isHome?page:related.home??null).find(s=>s.sectionKey==='GLOBAL_FOOTER')?.content??{};
 const editEntries=page?(isHome?homeSectionMap(page,related).map(row=>({label:row.label,sourceSlug:row.sourceSlug,sectionId:row.section?.id,schemaKey:row.section?.sectionKey??row.editorKey,selector:row.key==='GLOBAL_FOOTER'?'#website-footer':row.key==='HOME_TEACHER'?'#teacher':row.section?'#section-'+row.section.id:row.key==='HOME_YOUTUBE_CLASSES'?'#homepage-video-classes':'#unconfigured-'+row.key,surface:'home' as const})):sections.map(section=>({label:section.heading||section.kind,sourceSlug:page.slug,sectionId:section.id,schemaKey:section.sectionKey,selector:'#section-'+section.id,surface:'page' as const}))):[];
 const footerText=(key:string)=>typeof footer[key]==='string'?footer[key] as string:'';
 const links=Array.isArray(footer.links)?footer.links.flatMap(entry=>{if(!entry||typeof entry!=='object')return [];const x=entry as Record<string,unknown>;return x.enabled!==false&&typeof x.label==='string'&&typeof x.url==='string'&&x.url&&safeContentUrl(x.url)?[{label:x.label,url:x.url,location:String(x.location??'both')}]:[];}):[];

 return <div className="tale-site">{!preview&&<><InvitationRedirect/><PublicCmsLinks entries={editEntries}/></>}<a className="tale-skip" href="#tale-content">Skip to content</a>{settings?.settings.tagline&&<div className="tale-topline">{settings.settings.tagline}</div>}
  <Header siteTitle={name} navigation={navigation} logoId={logoId} custom={links.filter(x=>x.location!=='footer')}/>
  <main id="tale-content">{page?<>{isHome?<Home page={page} related={related}/>:<div className="tale-page-width"><SiteDiscovery entries={buildPublishedDirectory(sections)}/>{sections.map(section=><InfoSection key={section.id} section={section} slug={page.slug}/>)}</div>}</>:<div className="tale-empty"><h1>Website content is being prepared</h1><p>Published information will appear here soon.</p></div>}</main>
  <footer id="website-footer" className="tale-footer"><div className="tale-footer-columns"><div><Link href="/" className="tale-footer-brand">{name} <span>✦</span></Link><p>{footerText('description')||settings?.settings.tagline}</p>{settings?.settings.footerText&&<small>{settings.settings.footerText}</small>}</div><div><h3>Explore</h3>{links.some(x=>x.location!=='header')?links.filter(x=>x.location!=='header').map(x=><Link key={x.url+x.label} href={x.url}>{x.label}</Link>):<><Link href="/site/about">About</Link><Link href="/site/courses">Courses</Link><Link href="/site/results">Results</Link><Link href="/site/gallery">Gallery</Link></>}</div><div><h3>Academics</h3><Link href="/site/academic-calendar">Academic calendar</Link><Link href="/site/class-routine">Class routine</Link><Link href="/site/materials">Materials</Link><Link href="/site/news-events">News & events</Link></div><div><h3>Get in touch</h3>{settings?.settings.contactEmail&&<a href={`mailto:${settings.settings.contactEmail}`}>{settings.settings.contactEmail}</a>}{settings?.settings.contactPhone&&<a href={`tel:${settings.settings.contactPhone}`}>{settings.settings.contactPhone}</a>}<Link href="/portal">Student / Teacher portal →</Link></div></div><div className="tale-footer-bottom">© {footerText('copyrightText')||`${new Date().getFullYear()} ${name}. All rights reserved.`} <a href="#tale-content">Back to top ↑</a></div></footer>
 </div>;
}
