import { PagesWorkspace } from '@/components/admin/pages/PagesWorkspace';
import { normalizeAdminProjectId } from '@/lib/domain/pages-client/project-context';

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const projectId = normalizeAdminProjectId(resolvedSearchParams?.projectId);

  return <PagesWorkspace projectId={projectId} />;
}
