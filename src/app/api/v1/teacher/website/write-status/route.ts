import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {createWriteStatusRoute} from '@/server/write-readiness.mjs';
import {callCms} from '@/server/http/production-cms-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// The shared boundary verifies the active Teacher and sends Cache-Control: no-store.
// Read reachability and runtime configuration are not proof of successful writes.
export const GET=createWriteStatusRoute({verify:verifyActiveActor,env:process.env,
 probe:(token)=>callCms('coaching_cms_list_pages',token,{}),
});
