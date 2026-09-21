import React from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireAuthenticatedUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser().catch(() => null);
  
  if (!user) {
    redirect('/admin/login');
  }

  const isAuthorized = await hasPermission(user.id, 'admin.access').catch(() => false);
  if (!isAuthorized) {
    redirect('/admin/login');
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
