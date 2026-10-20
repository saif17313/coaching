/** Deep links for public cards must target routes implemented by the app. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function publicItemLink(kind,id){
 if(!['news','gallery'].includes(kind)||typeof id!=='string'||!uuid.test(id))return null;
 return `/site/${kind==='news'?'news-events':'gallery'}#item-${id.toLowerCase()}`;
}
