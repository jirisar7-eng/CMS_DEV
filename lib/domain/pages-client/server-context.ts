import { cookies } from 'next/headers';
import { normalizeAdminProjectId } from './project-context';

export async function getActiveProjectId(): Promise<string | null> {
  const cookieStore = await cookies();
  const rawId = cookieStore.get('syn_project_id')?.value;
  return normalizeAdminProjectId(rawId);
}
