import localFont from 'next/font/local';

/** EB Garamond Italic, self-hosted (SIL OFL 1.1, see fonts/OFL-EBGaramond.txt) for the brand loading screens. */
export const brandSerif=localFont({src:'./fonts/EBGaramond-Italic-latin.woff2',weight:'500',style:'italic',display:'swap',variable:'--font-brand-serif',adjustFontFallback:'Times New Roman'});
