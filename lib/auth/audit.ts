import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getSession } from './session';
import { sanitizeAuditMetadata } from '@/lib/domain/audit';

export type AuditAction =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGOUT'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_MFA_ENROLLMENT_STARTED'
  | 'AUTH_MFA_ENABLED'
  | 'AUTH_MFA_RECOVERY_USED'
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
  | 'MEDIA_ASSET_DELETED'
  | 'CONTENT_PAGE_CREATED'
  | 'CONTENT_DRAFT_UPDATED'
  | 'CONTENT_REVIEW_SUBMITTED'
  | 'CONTENT_CHANGES_REQUESTED'
  | 'CONTENT_REVIEW_APPROVED'
  | 'CONTENT_RELEASE_PUBLISHED'
  | 'CONTENT_RELEASE_ROLLED_BACK'
  | 'CONTENT_DRAFT_REOPENED'
  | 'CONTENT_PUBLISH_SCHEDULED'
  | 'CONTENT_PUBLISH_SCHEDULE_CANCELLED'
  | 'CONTENT_PAGE_UNPUBLISHED'
  | 'PLUGIN_ENABLE'
  | 'PLUGIN_DISABLE'
  | 'PLUGIN_CONFIGURE'
  | 'NAVIGATION_SET_CREATED'
  | 'NAVIGATION_SET_UPDATED'
  | 'NAVIGATION_SET_DELETED';

export type ScopeType = 'SYSTEM' | 'PROJECT';

interface AuditLogOptions {
  action: AuditAction;
  scopeType: ScopeType;
  scopeId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, any>;
  actorId?: string | null; // Defaults to current session user if not provided
  tx?: Prisma.TransactionClient;
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

  // Ensure metadata is sanitized before DB write using shared policy
  const cleanMetadata = options.metadata
    ? sanitizeAuditMetadata(options.metadata, options.action, { mode: 'write' })
    : null;

  const db = options.tx ?? prisma;
  await db.auditLog.create({
    data: {
      action: options.action,
      scopeType: options.scopeType,
      scopeId: options.scopeId || null,
      resourceType: options.resourceType || null,
      resourceId: options.resourceId || null,
      metadata: cleanMetadata && Object.keys(cleanMetadata).length > 0 ? (cleanMetadata as Prisma.InputJsonObject) : undefined,
      actorId: actorId || null,
    },
  });
}
