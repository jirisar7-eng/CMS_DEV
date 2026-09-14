import React from 'react';
import { PageDetailWorkspace } from '@/components/admin/pages/PageDetailWorkspace';

export const metadata = {
  title: 'Detail stránky | Synthesis CMS',
  description: 'Správa obsahu, nastavení, SEO a historie revizí stránky.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PageDetailRoute({ params }: PageProps) {
  const resolvedParams = await params;
  return <PageDetailWorkspace pageId={resolvedParams.id} />;
}
