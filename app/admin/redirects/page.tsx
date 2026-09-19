import { RedirectsWorkspace } from '@/components/admin/redirects/RedirectsWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export default async function RedirectsPage() {
  const projectId = await getActiveProjectId();

  return <RedirectsWorkspace projectId={projectId} />;
}
