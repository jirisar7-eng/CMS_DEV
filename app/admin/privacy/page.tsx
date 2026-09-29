import { PrivacyWorkspace } from '@/components/admin/privacy/PrivacyWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export default async function PrivacyPage() {
  const projectId = await getActiveProjectId();
  return <PrivacyWorkspace initialProjectId={projectId} />;
}
