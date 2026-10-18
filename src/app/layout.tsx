import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:{default:'Musa Sir | Learning Studio',template:'%s | Musa Sir'},description:'A thoughtful learning experience for every student.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
