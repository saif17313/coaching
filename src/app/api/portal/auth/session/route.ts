import {NextRequest} from 'next/server';
import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {COOKIE_NAME} from '@/server/browser-session.mjs';
import {createBrowserSessionRead} from '@/server/http/browser-session-read.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=createBrowserSessionRead({verify:verifyActiveActor,tokenOf:request=>(request as NextRequest).cookies.get(COOKIE_NAME)?.value});
