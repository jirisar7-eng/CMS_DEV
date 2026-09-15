import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { Hero } from '@/components/public/Hero';
import { Features } from '@/components/public/Features';
import { WhySynthesis } from '@/components/public/WhySynthesis';
import { Pricing } from '@/components/public/Pricing';
import { TechRequirements } from '@/components/public/TechRequirements';
import { Documentation } from '@/components/public/Documentation';
import { Security } from '@/components/public/Security';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Synthesis CMS',
  description: 'Univerzální modulární systém pro tvorbu a správu webů, portálů a PWA. Obsah, média, publikování a oprávnění v jednom systému.',
};

export default function RootPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <WhySynthesis />
        <Pricing />
        <TechRequirements />
        <Documentation />
        <Security />
      </main>
      <PublicFooter />
    </div>
  );
}
