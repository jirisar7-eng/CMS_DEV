import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { TechRequirements } from '@/components/public/TechRequirements';
import { CompactFooter } from '@/components/public/CompactFooter';

export const metadata = {
  title: 'Požadavky - Synthesis CMS',
  description: 'Technické požadavky pro nasazení Synthesis CMS.',
};

export default function RequirementsPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1 pt-16">
        <TechRequirements />
      </main>
      <CompactFooter />
    </div>
  );
}
