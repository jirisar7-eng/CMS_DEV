import { PagesWorkspace } from '@/components/admin/pages/PagesWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const projectId = await getActiveProjectId();

  return <PagesWorkspace projectId={projectId} />;
}
