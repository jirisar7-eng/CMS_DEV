import React from 'react';
import { PageCreateWorkspace } from '@/components/admin/pages/PageCreateWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export const metadata = {
  title: 'Nová stránka | Synthesis CMS',
  description: 'Vytvoření nové stránky v redakčním systému Synthesis.',
};

interface NewPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function NewPage({ searchParams }: NewPageProps) {
  const resolvedSearchParams = await searchParams;
  const projectId = await getActiveProjectId();

  return <PageCreateWorkspace projectId={projectId} />;
}
