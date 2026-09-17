import React from 'react';
import { PageComposerWorkspace } from '@/components/admin/composer/PageComposerWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export const metadata = {
  title: 'Editor obsahu (Composer) | Synthesis CMS',
  description: 'Kanonický blokový editor obsahu pro stránky Synthesis.',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
}

export default async function PageComposerRoute({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const p = await getActiveProjectId(); const projectId = p === null ? undefined : p;

  return <PageComposerWorkspace pageId={resolvedParams.id} projectId={projectId} />;
}
