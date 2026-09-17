import React from 'react';
import { PageDetailWorkspace } from '@/components/admin/pages/PageDetailWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export const metadata = {
  title: 'Detail stránky | Synthesis CMS',
  description: 'Správa obsahu, nastavení, SEO a historie revizí stránky.',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
}

export default async function PageDetailRoute({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const projectId = await getActiveProjectId();

  return <PageDetailWorkspace pageId={resolvedParams.id} projectId={projectId} />;
}
