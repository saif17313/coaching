import {notFound} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {publicPage} from '@/server/website/public-site';
import {ItemDetails} from '@/components/website/TypedContent';
export const dynamic='force-dynamic';
export default async function PublishedItem({params}:{params:Promise<{slug:string;itemId:string}>}){
 const {slug,itemId}=await params;
 if(!/^[0-9a-f-]{36}$/.test(itemId))notFound();
 const page=await publicPage(slug),section=page?.sections.find(s=>s.items.some(i=>i.id===itemId)),item=section?.items.find(i=>i.id===itemId);
 if(!page||!section||!item)notFound();
 return <main className="tale-site tale-page-width"><Link href={`/site/${slug}`}>← {page.title}</Link><article className="tale-block"><h1>{item.title}</h1>{item.mediaId&&<Image unoptimized src={`/api/v1/public/media/${item.mediaId}`} alt={item.title} width={960} height={640}/>}<p>{item.description}</p>{item.metadata&&<ItemDetails section={section} value={item.metadata}/>}</article></main>;
}
