import React from 'react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { getActiveProjectId } from '@/lib/domain/pages-client/server-context';
import { ClientProjectList } from './ClientProjectList';

export default async function ProjectsPage() {
  const { user } = await getSession();
  if (!user || user.status !== 'ACTIVE') {
    return <div>Unauthorized</div>;
  }

  const allProjects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' }
  });

  const authorizedProjects = [];
  for (const project of allProjects) {
    const canAccessAdmin = await hasPermission(user.id, 'admin.access', project.id);
    const canViewProject = await hasPermission(user.id, 'projects.view', project.id);
    if (canAccessAdmin || canViewProject) {
      authorizedProjects.push(project);
    }
  }

  const activeProjectId = await getActiveProjectId();

  return <ClientProjectList projects={authorizedProjects} activeProjectId={activeProjectId} />;
}
