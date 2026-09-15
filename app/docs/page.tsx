import React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { Documentation } from '@/components/public/Documentation';
import { CompactFooter } from '@/components/public/CompactFooter';

export const metadata = {
  title: 'Dokumentace - Synthesis CMS',
  description: 'Technická dokumentace a návody pro Synthesis CMS.',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col selection:bg-primary/20">
      <PublicHeader />
      <main className="flex-1 pt-16">
        <Documentation />
      </main>
      <CompactFooter />
    </div>
  );
}
