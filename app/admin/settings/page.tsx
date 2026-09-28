import { SettingsWorkspace } from '@/components/admin/settings/SettingsWorkspace';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';

export default async function SettingsPage() {
  const projectId = await getActiveProjectId();
  return <SettingsWorkspace initialProjectId={projectId} />;
}
