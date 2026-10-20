import {cookies} from 'next/headers';
import {COOKIE_NAME} from '@/server/browser-session.mjs';
import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {CmsPreviewCanvas} from '@/components/portal/CmsPreviewCanvas';
export const dynamic='force-dynamic';
export default async function WebsitePreviewPage(){
 const token=(await cookies()).get(COOKIE_NAME)?.value;if(!token)return <p>Sign in as a Teacher to preview drafts.</p>;
 const actor=await verifyActiveActor(token).catch(()=>null);
 if(!actor)return <p>Draft preview authentication is unavailable. Recheck your session, then reload the preview.</p>;
 if(actor.role!=='teacher')return <p>Teacher access is required.</p>;
 return <CmsPreviewCanvas/>;
}
