import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { CompactHero } from '@/components/public/CompactHero';
import { CompactBenefits } from '@/components/public/CompactBenefits';
import { CompactStatus } from '@/components/public/CompactStatus';
import { CompactFinalCta } from '@/components/public/CompactFinalCta';
import { CompactFooter } from '@/components/public/CompactFooter';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Synthesis CMS',
  description: 'Moderní modulární CMS pro tvorbu a správu webů, portálů a PWA. Obsah, média, publikování a oprávnění v jednom přehledném systému.',
};

export default function RootPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1">
        <CompactHero />
        <CompactBenefits />
        <CompactStatus />
        <CompactFinalCta />
      </main>
      <CompactFooter />
    </div>
  );
}
