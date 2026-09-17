import { prisma } from '@/lib/db';
import { getSession } from './session';

export type PermissionKey =
  | 'admin.access'
  | 'brand.view'
  | 'brand.edit'
  | 'brand.publish'
  | 'brand.rollback'
  | 'media.view'
  | 'media.create'
  | 'media.edit'
  | 'media.delete'
  | 'users.view'
  | 'users.manage'
  | 'roles.view'
  | 'roles.manage'
  | 'audit.view'
  | 'system.manage'
  | 'projects.view'
  | 'projects.manage'
  | 'content.view'
  | 'content.create'
  | 'content.edit'
  | 'content.review'
  | 'content.approve'
  | 'content.publish'
  | 'content.rollback'
  | 'content.archive'
  | 'navigation.view'
  | 'navigation.create'
  | 'navigation.edit'
  | 'navigation.delete'
  | 'navigation.publish';

export async function hasPermission(
  userId: string,
  permissionKey: PermissionKey,
  projectId?: string | null
): Promise<boolean> {
  // 1. Get the requested permission entity
  const permission = await prisma.permission.findUnique({
    where: { key: permissionKey },
  });

  if (!permission) {
    // If the permission doesn't exist in the system, fail closed.
    return false;
  }

  // 2. Check for explicit User Permission Overrides FIRST
  const overrides = await prisma.userPermissionOverride.findMany({
    where: {
      userId,
      permissionId: permission.id,
      OR: [
        { projectId: projectId ?? null },
        { projectId: null }, // Global override applies to all projects
      ],
    },
  });

  // Sort overrides to prioritize specific project over global if both exist
  const specificOverride = overrides.find((o: { projectId: string | null }) => o.projectId === projectId);
  const globalOverride = overrides.find((o: { projectId: string | null }) => o.projectId === null);

  // If there's an explicit DENY (isGranted === false), it overrides everything.
  // We check specific first, then global.
  if (specificOverride) {
    if (!specificOverride.isGranted) return false;
  } else if (globalOverride) {
    if (!globalOverride.isGranted) return false;
  }

  // If explicit ALLOW, grant access
  if (specificOverride?.isGranted || globalOverride?.isGranted) {
    return true;
  }

  // 3. Fallback to Role-based permissions
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      OR: [
        { projectId: projectId ?? null },
        { projectId: null }, // Global roles apply to all projects
      ],
    },
    include: {
      role: {
        include: {
          permissions: {
            where: { permissionId: permission.id },
          },
        },
      },
    },
  });

  // If ANY of the user's roles have the permission, allow.
  for (const ur of userRoles) {
    if (ur.role.permissions.length > 0) {
      return true;
    }
  }

  // 4. Default DENY
  return false;
}

/**
 * Ensures the current authenticated user has the specified permission.
 * Throws an error if unauthorized.
 */
export async function requirePermission(permissionKey: PermissionKey, projectId?: string | null): Promise<void> {
  const { user } = await getSession();
  
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('UNAUTHENTICATED');
  }

  const isAuthorized = await hasPermission(user.id, permissionKey, projectId);
  if (!isAuthorized) {
    throw new Error('UNAUTHORIZED');
  }
}
