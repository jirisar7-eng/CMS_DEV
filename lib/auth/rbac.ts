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
  | 'navigation.publish'
  | 'seo.read'
  | 'seo.update'
  | 'seo.manage_defaults'
  | 'redirects.read'
  | 'redirects.create'
  | 'redirects.update'
  | 'redirects.delete'
  | 'search.read_admin'
  | 'search.manage'
  | 'search.reindex'
  | 'system_map.read_basic'
  | 'system_map.read_internal'
  | 'plugin.read'
  | 'plugin.manage';

export async function hasPermission(
  userId: string,
  permissionKey: PermissionKey,
  projectId?: string | null
): Promise<boolean> {
  try {
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

    // Precedence: ANY applicable DENY overrides everything
    if (overrides.some((o: { isGranted: boolean }) => !o.isGranted)) {
      return false;
    }

    // Else ANY applicable ALLOW grants access
    if (overrides.some((o: { isGranted: boolean }) => o.isGranted)) {
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
  } catch (_error) {
    // Evaluation/dependency failure -> DENY (fail-closed)
    return false;
  }
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
