import { SeoWorkspace } from '@/components/admin/seo/SeoWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export default async function SeoPage() {
  const projectId = await getActiveProjectId();

  return <SeoWorkspace projectId={projectId} />;
}
