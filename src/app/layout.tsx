import '@/components/website/shifat-aligned.css';
import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:{default:'EduCentre | Learning Studio',template:'%s | EduCentre'},description:'A thoughtful learning experience for every student.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>;}
