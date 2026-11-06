import {Fraunces,Manrope} from 'next/font/google';

/** Public website typefaces, self-hosted by next/font: an editorial serif for headings and a clean humanist sans for reading. */
export const siteSerif=Fraunces({subsets:['latin'],axes:['opsz','SOFT'],display:'swap',variable:'--font-site-serif'});
export const siteSans=Manrope({subsets:['latin'],display:'swap',variable:'--font-site-sans'});
