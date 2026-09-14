import React from 'react';
import { PageComposerWorkspace } from '@/components/admin/composer/PageComposerWorkspace';

export const metadata = {
  title: 'Editor obsahu (Composer) | Synthesis CMS',
  description: 'Kanonický blokový editor obsahu pro stránky Synthesis.',
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

export default async function PageComposerRoute({ params }: PageProps) {
  const resolvedParams = await params;
  return <PageComposerWorkspace pageId={resolvedParams.id} />;
}
