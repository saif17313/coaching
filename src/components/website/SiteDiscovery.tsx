'use client';
import {useState} from 'react';
import {searchPublishedDirectory} from '@/client/public-discovery.mjs';
import type {PublicDirectoryEntry} from '@/client/public-discovery.mjs';

// Receives only a minimal index derived from the already-public snapshot.
export function SiteDiscovery({entries}:{entries:PublicDirectoryEntry[]}){
 const [query,setQuery]=useState('');
 if(entries.length<2)return null;
 const matches=searchPublishedDirectory(entries,query);
 const entered=query.trim().length>=2;
 return <div className="musa-discover" aria-label="Explore this published page">
  <nav className="musa-discover-links" aria-label="Jump to page section"><span className="musa-discover-caption">EXPLORE</span>{entries.slice(0,24).map(entry=><a key={entry.id} href={`#section-${entry.id}`} title={entry.label}>{entry.label}</a>)}</nav>
  <details className="musa-discover-search"><summary aria-label="Search this page">Search page <span aria-hidden="true">⌕</span></summary><div className="musa-discover-panel"><label htmlFor="musa-page-search">Find published content</label><input id="musa-page-search" type="search" maxLength={80} autoComplete="off" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search courses, news, results…"/>
    <div className="musa-discover-results" aria-live="polite">{entered?matches.length?`${matches.length} matching results`:'No matching published content':'Type at least 2 characters'}</div>
    {entered&&matches.length>0&&<ul>{matches.map((result,index)=><li key={`${result.id}-${index}`}><a href={`#section-${result.id}`}><strong>{result.title}</strong><small>{result.section}</small>{result.excerpt&&<span>{result.excerpt}</span>}</a></li>)}</ul>}
   </div></details>
 </div>;
}
