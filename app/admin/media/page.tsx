import React from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { MediaLibraryWorkspace } from '@/components/admin/media/MediaLibraryWorkspace';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';

export default async function MediaPage() {
  const context = await getActiveProjectContext();
  const projectId = context.status === 'PROJECT_VALID' ? context.projectId : null;

  return (
    <AdminShell>
      <MediaLibraryWorkspace initialProjectId={projectId} />
    </AdminShell>
  );
}
