import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { Pricing } from '@/components/public/Pricing';
import { CompactFooter } from '@/components/public/CompactFooter';

export const metadata = {
  title: 'Ceník - Synthesis CMS',
  description: 'Licenční model a možnosti nasazení Synthesis CMS.',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1 pt-16">
        <Pricing />
      </main>
      <CompactFooter />
    </div>
  );
}
