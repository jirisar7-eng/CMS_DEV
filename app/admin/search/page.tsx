import { SearchWorkspace } from '@/components/admin/search/SearchWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  // Respect server-context as authoritative source of active project
  await searchParams;
  const projectId = await getActiveProjectId();

  return <SearchWorkspace projectId={projectId} />;
}
