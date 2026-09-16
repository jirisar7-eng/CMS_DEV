import { prisma } from '@/lib/db';
import { getSession } from './session';

export type AuditAction =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGOUT'
  | 'AUTH_SESSION_REVOKED'
  | 'USER_STATUS_CHANGED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'
  | 'PERMISSION_OVERRIDE_CHANGED'
  | 'BRAND_DRAFT_CREATED'
  | 'BRAND_DRAFT_UPDATED'
  | 'BRAND_DRAFT_DISCARDED'
  | 'BRAND_VALIDATED'
  | 'BRAND_PUBLISHED'
  | 'BRAND_ROLLED_BACK'
  | 'BRAND_ASSET_CHANGED'
  | 'MEDIA_ASSET_CREATED'
  | 'MEDIA_ASSET_DELETED';

export type ScopeType = 'SYSTEM' | 'PROJECT';

interface AuditLogOptions {
  action: AuditAction;
  scopeType: ScopeType;
  scopeId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, any>;
  actorId?: string | null; // Defaults to current session user if not provided
}

export async function logAudit(options: AuditLogOptions): Promise<void> {
  // If no actorId provided, try to resolve from current session
  let actorId = options.actorId;
  if (actorId === undefined) {
    try {
      const { user } = await getSession();
      if (user) {
        actorId = user.id;
      }
    } catch {
      actorId = null;
    }
  }

  // Ensure no sensitive data sneaks into metadata
  const cleanMetadata = options.metadata ? { ...options.metadata } : {};
  if (cleanMetadata.password) delete cleanMetadata.password;
  if (cleanMetadata.token) delete cleanMetadata.token;
  if (cleanMetadata.secret) delete cleanMetadata.secret;

  await prisma.auditLog.create({
    data: {
      action: options.action,
      scopeType: options.scopeType,
      scopeId: options.scopeId || null,
      resourceType: options.resourceType || null,
      resourceId: options.resourceId || null,
      metadata: Object.keys(cleanMetadata).length > 0 ? cleanMetadata : undefined,
      actorId: actorId || null,
    },
  });
}
