/** Published-only, data-minimizing index. Never index drafts, credentials, media keys or URLs. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const norm=v=>v.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,' ').trim();
export function buildPublishedDirectory(sections){
 if(!Array.isArray(sections)||sections.length>60)return [];
 const out=[],seen=new Set();
 for(const section of sections){
  if(!section||typeof section!=='object'||Array.isArray(section)||!UUID.test(section.id)||seen.has(section.id)||section.visible===false)continue;
  if(section.kind==='footer')continue;
  const label=text(section.heading,160)||text(section.kind,32).replaceAll('-',' ');
  if(!label)continue;
  seen.add(section.id);
  const items=Array.isArray(section.items)?section.items.slice(0,40):[];
  const snippets=[];
  for(const item of items){
   if(!item||typeof item!=='object'||Array.isArray(item)||item.visible===false)continue;
   const title=text(item.title,160),description=text(item.description,320);
   if(title||description)snippets.push({title,description});
  }
  out.push({id:section.id,label,kind:text(section.kind,40),description:text(section.body,320),items:snippets});
 }
 return out;
}
export function searchPublishedDirectory(entries,query){
 if(!Array.isArray(entries)||typeof query!=='string'||query.length>120)return [];
 const q=norm(query);if(q.length<2)return [];
 const results=[];
 for(const entry of entries.slice(0,60)){
  if(!entry||!UUID.test(entry.id))continue;
  const sectionText=norm([entry.label,entry.kind,entry.description].join(' '));
  if(sectionText.includes(q)){
   results.push({id:entry.id,section:entry.label,title:entry.label,excerpt:entry.description.slice(0,140)});
   if(results.length===12)break;
   continue;
  }
  for(const item of entry.items.slice(0,40)){
   if(norm(`${item.title} ${item.description}`).includes(q)){
    results.push({id:entry.id,section:entry.label,title:item.title||entry.label,excerpt:item.description.slice(0,140)});
    if(results.length===12)break;
   }
  }
  if(results.length===12)break;
 }
 return results;
}
