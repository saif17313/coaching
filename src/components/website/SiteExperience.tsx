import type {SitePage,SiteSection,SiteSettings,NavItem} from '@/server/website/public-site';
import Link from 'next/link';
const linkFor=(url:string|null)=>url&&url.startsWith('https://')?url:null;
const hrefFor=(slug:string)=>slug==='home'?'/':`/site/${slug}`;
function ContentItem({item,kind}:{item:SiteSection['items'][number];kind:string}){
 const url=linkFor(item.url);
 return <article className={'musa-item musa-item-'+kind}>
  {item.mediaId&&<div className="musa-item-image"><img src={`/api/v1/public/media/${item.mediaId}`} alt={item.title||'Gallery image'} loading="lazy" /></div>}
  <div className="musa-item-body">{item.title&&<h3>{item.title}</h3>}{item.description&&<p>{item.description}</p>}
   {url&&<a href={url} rel="noopener noreferrer" target="_blank" className="musa-inline-link">Explore <span aria-hidden="true">↗</span></a>}
  </div>
 </article>;
}
function Section({section,index}:{section:SiteSection;index:number}){
 const isHero=section.kind==='hero',isFaq=section.kind==='faq';
 return <section id={`section-${index}`} className={`musa-section musa-section-${section.kind} ${isHero?'musa-hero':''}`} aria-label={section.heading||section.kind}>
  <div className="musa-section-heading">{isHero&&<p className="musa-eyebrow"><span className="musa-live-dot"/> Learn · Grow · Achieve</p>}
   {section.heading&& (isHero?<h1>{section.heading}</h1>:<h2>{section.heading}</h2>)}
   {section.body&&<p className="musa-section-subtitle">{section.body}</p>}
   {isHero&&<div className="musa-hero-actions"><a href="#explore" className="musa-button musa-button-primary">Explore our programs <span aria-hidden="true">↗</span></a><a href="#contact-info" className="musa-button musa-button-outline">Get in touch</a></div>}
  </div>
  {isHero&&<div className="musa-hero-art" aria-hidden="true"><div className="musa-art-halo"/><div className="musa-art-panel"><span className="musa-art-spark">✦</span><span className="musa-art-word">Progress</span><span className="musa-art-line"/><span className="musa-art-caption">Every day, a little further.</span></div><span className="musa-art-accent">✧</span></div>}
  {isFaq?<div className="musa-faq">{section.items.map(item=><details key={item.id}><summary>{item.title}<span aria-hidden="true">+</span></summary><p>{item.description}</p></details>)}</div>
  :section.items.length>0&&<div className={`musa-items ${['gallery','cards','results','courses','reviews'].includes(section.kind)?'musa-grid':''}`}>{section.items.map(item=><ContentItem key={item.id} item={item} kind={section.kind}/>)}</div>}
 </section>;
}
export function SiteExperience({page,settings,navigation}:{page:SitePage|null;settings:SiteSettings|null;navigation:NavItem[]}){
 const name=settings?.settings.siteTitle||'Musa Sir',s=settings?.settings;
 const sections=[...(page?.sections??[])].sort((a,b)=>a.order-b.order);
 return <div className="musa-site">
  <div className="musa-announcement"><span>✦</span> Building confidence, one lesson at a time <span>✦</span></div>
  <header className="musa-site-header"><div className="musa-nav-wrap"><Link href="/" className="musa-logo"><span className="musa-logo-emblem">M</span><span className="musa-logo-words"><strong>{name}</strong><small>LEARNING STUDIO</small></span></Link>
   <nav aria-label="Website navigation" className="musa-navigation">{navigation.slice(0,8).map(x=><Link key={x.slug} href={hrefFor(x.slug)}>{x.title}</Link>)}</nav>
   <a className="musa-header-cta" href="#contact-info">Contact us <span aria-hidden="true">↗</span></a>
  </div></header>
  <main id="explore" className="musa-site-main">{page?sections.length?sections.map((s,i)=><Section key={s.id} section={s} index={i}/>):<div className="musa-empty"><span className="musa-empty-icon">✦</span><h1>{page.title}</h1><p>Our new learning experience is being prepared.</p></div>
  :<div className="musa-empty"><p className="musa-eyebrow">Musa Sir Learning Studio</p><h1>A better way to learn is taking shape.</h1><p>Our website is being prepared. Please check back soon.</p><div className="musa-empty-ornament" aria-hidden="true">✧</div></div>}
  </main>
  <footer id="contact-info" className="musa-footer"><div className="musa-footer-inner"><div><div className="musa-footer-brand">{name}<span>✦</span></div>{s?.tagline&&<p>{s.tagline}</p>}<p className="musa-footnote">{s?.footerText||'Thoughtful learning. Meaningful progress.'}</p></div>
  <div className="musa-footer-contact"><strong>Get in touch</strong>{s?.contactEmail&&<a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>}{s?.contactPhone&&<a href={`tel:${s.contactPhone}`}>{s.contactPhone}</a>}<span>Learning made personal.</span></div></div>
  <div className="musa-footer-bottom">© {new Date().getFullYear()} {name}. All rights reserved.</div></footer>
 </div>;
}
