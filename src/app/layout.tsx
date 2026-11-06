import '@/components/website/shifat-aligned.css';
import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { NavigationProgressBar } from '@/components/common/NavigationProgressBar';
import { EduCentrePreloader } from '@/components/common/EduCentrePreloader';
import { brandSerif } from '@/components/common/brand-fonts';

export const metadata: Metadata = {
  title: { default: 'EduCentre | Learning Studio', template: '%s | EduCentre' },
  description: 'A thoughtful learning experience for every student.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={brandSerif.variable}>
      <body>
        <EduCentrePreloader />
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
