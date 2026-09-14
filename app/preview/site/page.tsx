import React from 'react';
import { PublicHeader } from '@/components/preview/PublicHeader';
import { Hero } from '@/components/preview/Hero';
import { KeyRoutes } from '@/components/preview/KeyRoutes';
import { FeaturedSection } from '@/components/preview/FeaturedSection';
import { CompactFooter } from '@/components/preview/CompactFooter';

export default function PreviewSitePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1">
        <Hero />
        <KeyRoutes />
        <FeaturedSection />
      </main>
      <CompactFooter />
    </div>
  );
}
