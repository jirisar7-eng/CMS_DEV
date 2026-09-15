import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { Security } from '@/components/public/Security';
import { CompactFooter } from '@/components/public/CompactFooter';

export const metadata = {
  title: 'Bezpečnost - Synthesis CMS',
  description: 'Bezpečnostní standardy a audity v Synthesis CMS.',
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1 pt-16">
        <Security />
      </main>
      <CompactFooter />
    </div>
  );
}
