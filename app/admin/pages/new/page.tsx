import React from 'react';
import { PageCreateWorkspace } from '@/components/admin/pages/PageCreateWorkspace';
import { normalizeAdminProjectId } from '@/lib/domain/pages-client/project-context';

export const metadata = {
  title: 'Nová stránka | Synthesis CMS',
  description: 'Vytvoření nové stránky v redakčním systému Synthesis.',
};

interface NewPageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function NewPage({ searchParams }: NewPageProps) {
  const resolvedSearchParams = await searchParams;
  const projectId = normalizeAdminProjectId(resolvedSearchParams?.projectId);

  return <PageCreateWorkspace projectId={projectId} />;
}
