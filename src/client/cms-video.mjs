/** Published HTTPS video links: deliberately narrow YouTube URL recognizer.
 * Never returns arbitrary iframe locations or reads untrusted HTML. */
const ID = /^[A-Za-z0-9_-]{11}$/;
const WEB = new Set(['youtube.com','www.youtube.com','m.youtube.com']);
const NOCOOKIE = new Set(['youtube-nocookie.com','www.youtube-nocookie.com']);
export function youtubeVideoId(value) {
  if (typeof value !== 'string' || value.length < 18 || value.length > 2048) return null;
  if (/(?:\/|%2f)(?:\.|%2e){1,2}(?:\/|%2f|$)/i.test(value.split(/[?#]/,1)[0])) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
  let video = null;
  if (WEB.has(u.hostname)) {
    if (u.pathname === '/watch') {
      const ids = u.searchParams.getAll('v');
      if (ids.length !== 1) return null;
      video = ids[0];
    } else {
      const match = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(u.pathname);
      if (!match) return null;
      video = match[1];
    }
  } else if (u.hostname === 'youtu.be') {
    const match = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(u.pathname);
    if (!match) return null;
    video = match[1];
  } else if (NOCOOKIE.has(u.hostname)) {
    const match = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/.exec(u.pathname);
    if (!match) return null;
    video = match[1];
  } else return null;
  return ID.test(video ?? '') ? video : null;
}

export function normalizeYoutubeUrl(value){const id=youtubeVideoId(value);return id?`https://www.youtube.com/watch?v=${id}`:null;}
