import { cookies } from 'next/headers';
import { normalizeAdminProjectId } from './project-context';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';

export type ProjectContextStatus = 
  | 'PROJECT_NOT_SELECTED'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_FORBIDDEN'
  | 'PROJECT_INACTIVE'
  | 'PROJECT_VALID';

export interface ProjectContextResult {
  userId?: string | null;
  status: ProjectContextStatus;
  projectId: string | null;
}

export async function getActiveProjectContext(): Promise<ProjectContextResult> {
  const cookieStore = await cookies();
  const rawId = cookieStore.get('syn_project_id')?.value;
  const projectId = normalizeAdminProjectId(rawId);

  if (!projectId) {
    return { status: 'PROJECT_NOT_SELECTED', projectId: null };
  }

  const { user } = await getSession();
  if (!user || user.status !== 'ACTIVE') {
    return { status: 'PROJECT_FORBIDDEN', projectId: null };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });

  if (!project) {
    return { status: 'PROJECT_NOT_FOUND', projectId: null };
  }

  if (project.status !== 'ACTIVE') {
    return { status: 'PROJECT_INACTIVE', projectId: null };
  }

  // Check if user has access to this project
  const canAccessAdmin = await hasPermission(user.id, 'admin.access', project.id);
  const canViewProject = await hasPermission(user.id, 'projects.view', project.id);
  
  if (!canAccessAdmin && !canViewProject) {
    return { status: 'PROJECT_FORBIDDEN', projectId: null };
  }

  return { status: 'PROJECT_VALID', projectId: project.id, userId: user.id };
}

// Backward compatibility for existing routes that expect just the ID
// but safely returns null if any validation fails
export async function getActiveProjectId(): Promise<string | null> {
  const context = await getActiveProjectContext();
  if (context.status === 'PROJECT_VALID') {
    return context.projectId;
  }
  return null;
}
