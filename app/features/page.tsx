import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { Features } from '@/components/public/Features';
import { WhySynthesis } from '@/components/public/WhySynthesis';
import { CompactFooter } from '@/components/public/CompactFooter';

export const metadata = {
  title: 'Funkce - Synthesis CMS',
  description: 'Přehled všech modulů a funkcí Synthesis CMS.',
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1 pt-16">
        <Features />
        <WhySynthesis />
      </main>
      <CompactFooter />
    </div>
  );
}
