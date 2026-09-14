'use client';

import React from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { MediaLibraryWorkspace } from '@/components/admin/media/MediaLibraryWorkspace';

export default function MediaPage() {
  return (
    <AdminShell>
      <MediaLibraryWorkspace />
    </AdminShell>
  );
}
