import React from 'react';
import { PageDetailWorkspace } from '@/components/admin/pages/PageDetailWorkspace';

export const metadata = {
  title: 'Detail stránky | Synthesis CMS',
  description: 'Správa obsahu, nastavení, SEO a historie revizí stránky.',
};

export function generateStaticParams() {
  return [
    { id: 'page-home' },
    { id: 'page-services' },
    { id: 'page-pricing' },
    { id: 'page-about' },
    { id: 'page-contact' },
    { id: 'page-gdpr' },
  ];
}

export const dynamicParams = true;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PageDetailRoute({ params }: PageProps) {
  const resolvedParams = await params;
  return <PageDetailWorkspace pageId={resolvedParams.id} />;
}
