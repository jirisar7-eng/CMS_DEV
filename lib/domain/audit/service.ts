import { PermissionKey } from "@/lib/auth/rbac";
import { NextResponse } from "next/server";
import {
  AuditLogQueryOptions,
  AuditLogsQueryResult,
  AuditScopeType,
  AuditServiceError,
  SafeAuditActor,
  SafeAuditRecord,
} from "./contracts";
import { isApiError, jsonError } from "@/lib/domain/pages-api";

export type FieldValidator = (val: unknown) => unknown | undefined;

export const safeString = (maxLen = 500): FieldValidator => (val: unknown) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }
  return undefined;
};

export const safeNumber = (): FieldValidator => (val: unknown) => {
  if (typeof val === "number" && Number.isFinite(val)) {
    return val;
  }
  return undefined;
};

export const safeBoolean = (): FieldValidator => (val: unknown) => {
  if (typeof val === "boolean") {
    return val;
  }
  return undefined;
};

export const safeStringArray = (maxItems = 50, maxLen = 100): FieldValidator => (val: unknown) => {
  if (!Array.isArray(val)) return undefined;
  const result: string[] = [];
  for (const item of val.slice(0, maxItems)) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        result.push(trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed);
      }
    }
  }
  return result;
};

// Event-specific safe metadata allowlists
export const EVENT_METADATA_SCHEMAS: Record<string, Record<string, FieldValidator>> = {
  // Authentication events
  AUTH_LOGIN_SUCCESS: {
    ip: safeString(100),
    userAgent: safeString(255),
    email: safeString(255),
    userId: safeString(100),
  },
  AUTH_LOGIN_FAILURE: {
    ip: safeString(100),
    userAgent: safeString(255),
    email: safeString(255),
    reason: safeString(255),
    attempt: safeNumber(),
  },
  AUTH_LOGOUT: {
    userId: safeString(100),
    reason: safeString(255),
  },
  AUTH_SESSION_REVOKED: {
    targetUserId: safeString(100),
    reason: safeString(255),
  },

  // User & RBAC events
  USER_STATUS_CHANGED: {
    targetUserId: safeString(100),
    status: safeString(50),
    previousStatus: safeString(50),
  },
  ROLE_ASSIGNED: {
    targetUserId: safeString(100),
    role: safeString(100),
    roleId: safeString(100),
  },
  ROLE_REMOVED: {
    targetUserId: safeString(100),
    role: safeString(100),
    roleId: safeString(100),
  },
  PERMISSION_OVERRIDE_CHANGED: {
    targetUserId: safeString(100),
    permission: safeString(100),
    granted: safeBoolean(),
  },

  // Content Lifecycle events
  CONTENT_PAGE_CREATED: {
    pageId: safeString(100),
    pageTitle: safeString(200),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
  },
  CONTENT_DRAFT_UPDATED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    note: safeString(500),
  },
  CONTENT_REVIEW_SUBMITTED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    note: safeString(500),
  },
  CONTENT_REVIEW_APPROVED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    note: safeString(500),
  },
  CONTENT_CHANGES_REQUESTED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    reason: safeString(500),
  },
  CONTENT_RELEASE_PUBLISHED: {
    pageId: safeString(100),
    releaseId: safeString(100),
    revisionId: safeString(100),
    releaseVersion: safeString(100),
  },
  CONTENT_RELEASE_ROLLED_BACK: {
    pageId: safeString(100),
    rollbackReleaseId: safeString(100),
    sourcePublishReleaseId: safeString(100),
    reason: safeString(500),
  },
  CONTENT_DRAFT_REOPENED: {
    pageId: safeString(100),
    sourcePublishedRevisionId: safeString(100),
    newDraftRevisionId: safeString(100),
  },

  // Brand events
  BRAND_DRAFT_CREATED: {
    brandId: safeString(100),
    version: safeNumber(),
  },
  BRAND_DRAFT_UPDATED: {
    brandId: safeString(100),
    version: safeNumber(),
  },
  BRAND_DRAFT_DISCARDED: {
    brandId: safeString(100),
    version: safeNumber(),
  },
  BRAND_VALIDATED: {
    brandId: safeString(100),
    version: safeNumber(),
  },
  BRAND_PUBLISHED: {
    brandId: safeString(100),
    version: safeNumber(),
    theme: safeString(100),
  },
  BRAND_ROLLED_BACK: {
    brandId: safeString(100),
    newVersion: safeNumber(),
    rolledBackFromVersionId: safeString(100),
    targetVersionId: safeString(100),
  },
  BRAND_ASSET_CHANGED: {
    brandId: safeString(100),
    assetId: safeString(100),
    action: safeString(100),
  },

  // Media events
  MEDIA_ASSET_CREATED: {
    mediaId: safeString(100),
    assetId: safeString(100),
    filename: safeString(255),
    mimeType: safeString(100),
    byteSize: safeNumber(),
  },
  MEDIA_ASSET_DELETED: {
    mediaId: safeString(100),
    assetId: safeString(100),
    filename: safeString(255),
  },

  // Plugin events
  PLUGIN_ENABLE: {
    pluginId: safeString(100),
    autoEnabledFor: safeString(100),
  },
  PLUGIN_DISABLE: {
    pluginId: safeString(100),
    cascadedFrom: safeString(100),
  },
  PLUGIN_CONFIGURE: {
    pluginId: safeString(100),
    updatedKeys: safeStringArray(50, 100),
  },

  // Navigation events
  NAVIGATION_SET_CREATED: {
    setId: safeString(100),
    name: safeString(100),
  },
  NAVIGATION_SET_UPDATED: {
    setId: safeString(100),
    name: safeString(100),
    itemCount: safeNumber(),
  },
  NAVIGATION_SET_DELETED: {
    setId: safeString(100),
  },
};

// Global fallback allowlist for safe schema fields
export const GLOBAL_SAFE_FIELDS: Record<string, FieldValidator> = {
  pageId: safeString(100),
  pageTitle: safeString(200),
  revisionId: safeString(100),
  revisionNumber: safeNumber(),
  releaseId: safeString(100),
  releaseVersion: safeString(100),
  rollbackReleaseId: safeString(100),
  sourcePublishReleaseId: safeString(100),
  sourcePublishedRevisionId: safeString(100),
  newDraftRevisionId: safeString(100),
  brandId: safeString(100),
  version: safeNumber(),
  newVersion: safeNumber(),
  targetVersionId: safeString(100),
  rolledBackFromVersionId: safeString(100),
  assetId: safeString(100),
  mediaId: safeString(100),
  filename: safeString(255),
  mimeType: safeString(100),
  byteSize: safeNumber(),
  pluginId: safeString(100),
  autoEnabledFor: safeString(100),
  cascadedFrom: safeString(100),
  updatedKeys: safeStringArray(50, 100),
  setId: safeString(100),
  name: safeString(100),
  itemCount: safeNumber(),
  targetUserId: safeString(100),
  role: safeString(100),
  roleId: safeString(100),
  permission: safeString(100),
  granted: safeBoolean(),
  status: safeString(50),
  previousStatus: safeString(50),
  ip: safeString(100),
  userAgent: safeString(255),
  email: safeString(255),
  userId: safeString(100),
  reason: safeString(500),
  note: safeString(500),
  theme: safeString(100),
  attempt: safeNumber(),
};

/**
 * Explicit allowlist projection for audit log metadata.
 * Unknown fields (such as access_token, refresh_token, passwordHash, nested objects,
 * or arbitrary free-text) are strictly omitted by default.
 */
export function sanitizeAuditMetadata(
  raw: unknown,
  action?: string
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const rawObj = raw as Record<string, unknown>;
  const schema = (action && EVENT_METADATA_SCHEMAS[action]) || GLOBAL_SAFE_FIELDS;
  const result: Record<string, unknown> = {};

  for (const [key, validator] of Object.entries(schema)) {
    if (key in rawObj) {
      const val = rawObj[key];
      const validated = validator(val);
      if (validated !== undefined) {
        result[key] = validated;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function parseStrictPositiveInt(
  value: string | null | undefined,
  defaultValue: number,
  fieldName: string
): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new AuditServiceError(
      "INVALID_INPUT",
      "Invalid " + fieldName + ": must be a positive integer",
      400
    );
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new AuditServiceError(
      "INVALID_INPUT",
      "Invalid " + fieldName + ": must be a positive integer",
      400
    );
  }
  return num;
}

export function validateAuditScopeType(
  scopeType: string | null | undefined
): AuditScopeType | undefined {
  if (!scopeType) return undefined;
  const upper = scopeType.trim().toUpperCase();
  if (upper === "PROJECT" || upper === "SYSTEM" || upper === "ALL") {
    return upper as AuditScopeType;
  }
  throw new AuditServiceError(
    "INVALID_INPUT",
    "Invalid scopeType '" + scopeType + "'. Must be PROJECT, SYSTEM, or ALL",
    400
  );
}

export function validateDateRange(
  from?: Date | string,
  to?: Date | string
): { fromDate?: Date; toDate?: Date } {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (from) {
    fromDate = from instanceof Date ? from : new Date(from);
    if (isNaN(fromDate.getTime())) {
      throw new AuditServiceError("INVALID_DATE_FILTER", "Invalid from date filter", 400);
    }
  }

  if (to) {
    toDate = to instanceof Date ? to : new Date(to);
    if (isNaN(toDate.getTime())) {
      throw new AuditServiceError("INVALID_DATE_FILTER", "Invalid to date filter", 400);
    }
  }

  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    throw new AuditServiceError(
      "INVALID_INPUT",
      "Invalid date range: 'from' date cannot be after 'to' date",
      400
    );
  }

  return { fromDate, toDate };
}

export function handleAuditApiError(err: unknown): NextResponse {
  if (err instanceof AuditServiceError) {
    const status = err.status || 500;
    const message =
      status >= 500
        ? "An unexpected error occurred while retrieving audit logs"
        : err.message;
    return jsonError(err.code, message, status);
  }
  if (isApiError(err)) {
    return jsonError(err.code, err.message, err.status);
  }
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") {
      return jsonError("UNAUTHENTICATED", "Authentication required", 401);
    }
    if (err.message === "DATABASE_UNAVAILABLE") {
      return jsonError("DATABASE_UNAVAILABLE", "Database unavailable", 503);
    }
    if (err.message === "FORBIDDEN") {
      return jsonError("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }
    if (err.message === "CSRF_REJECTED") {
      return jsonError("CSRF_REJECTED", "Cross-origin request rejected", 403);
    }
  }
  return jsonError("INTERNAL_ERROR", "An unexpected error occurred", 500);
}

export interface AuditStore {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: {
    where: Record<string, unknown>;
    take: number;
    skip: number;
    orderBy: Array<Record<string, "asc" | "desc">>;
    include?: Record<string, unknown>;
  }): Promise<Array<Record<string, unknown>>>;
}

export interface AuditServiceDependencies {
  store?: AuditStore;
  db?: AuditStore;
  hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;
}

const MAX_SAFE_OFFSET = 1_000_000;
const MAX_LIMIT = 100;

export class AuditService {
  private store: AuditStore | null;
  private hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;

  constructor(deps?: AuditServiceDependencies) {
    this.store = deps?.store ?? deps?.db ?? null;
    this.hasPermissionFn = deps?.hasPermissionFn;
  }

  private async getStore(): Promise<AuditStore> {
    if (this.store) return this.store;
    const { prisma } = await import("@/lib/db");
    return prisma.auditLog as unknown as AuditStore;
  }

  private async checkPermission(
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ): Promise<boolean> {
    if (this.hasPermissionFn) {
      return this.hasPermissionFn(userId, permissionKey, projectId);
    }
    const { hasPermission } = await import("@/lib/auth/rbac");
    return hasPermission(userId, permissionKey, projectId);
  }

  /**
   * Queries audit logs with strict permission enforcement, project isolation,
   * bounded pagination, deterministic ordering, and safe response projection.
   */
  async listAuditLogs(
    options: AuditLogQueryOptions,
    requestingUserId: string
  ): Promise<AuditLogsQueryResult> {
    if (!requestingUserId) {
      throw new AuditServiceError("UNAUTHENTICATED", "Authentication required", 401);
    }

    const projectId = options.projectId ? options.projectId.trim() : null;

    // 1. Authorize access
    if (projectId) {
      // Check project-specific permission
      const canRead = await this.checkPermission(requestingUserId, "audit.view", projectId);
      if (!canRead) {
        throw new AuditServiceError(
          "FORBIDDEN",
          "Forbidden: insufficient permissions for project audit logs",
          403
        );
      }
    } else {
      // Global/system query requires global audit.view authority (projectId: null)
      const canReadGlobal = await this.checkPermission(requestingUserId, "audit.view", null);
      if (!canReadGlobal) {
        throw new AuditServiceError(
          "FORBIDDEN",
          "Forbidden: insufficient permissions for system/global audit logs",
          403
        );
      }
    }

    // 2. Validate and clamp pagination parameters
    const scopeType = validateAuditScopeType(options.scopeType);

    const rawLimit = Number(options.limit);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
        : 20;

    const rawPage = Number(options.page);
    const page =
      Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

    const skip = (page - 1) * limit;
    if (skip > MAX_SAFE_OFFSET) {
      throw new AuditServiceError(
        "INVALID_INPUT",
        "Requested page offset exceeds maximum allowed range",
        400
      );
    }

    // 3. Construct Prisma WHERE filter
    const where: Record<string, unknown> = {};

    if (projectId) {
      // Strict project isolation: only PROJECT scope with matching scopeId
      where.scopeType = "PROJECT";
      where.scopeId = projectId;
    } else {
      // Global / System query
      if (scopeType === "SYSTEM") {
        where.scopeType = "SYSTEM";
      } else if (scopeType === "PROJECT") {
        where.scopeType = "PROJECT";
      }
    }

    if (options.action && options.action.trim()) {
      where.action = options.action.trim();
    }

    if (options.resourceType && options.resourceType.trim()) {
      where.resourceType = options.resourceType.trim();
    }

    // Date range filters
    const { fromDate, toDate } = validateDateRange(options.from, options.to);
    if (fromDate || toDate) {
      const createdAtFilter: Record<string, Date> = {};
      if (fromDate) {
        createdAtFilter.gte = fromDate;
      }
      if (toDate) {
        createdAtFilter.lte = toDate;
      }
      where.createdAt = createdAtFilter;
    }

    // 4. Execute query with deterministic ordering
    try {
      const store = await this.getStore();
      const [total, records] = await Promise.all([
        store.count({ where }),
        store.findMany({
          where,
          take: limit,
          skip,
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          include: {
            actor: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
        }),
      ]);

      const items: SafeAuditRecord[] = records.map((rec: Record<string, unknown>) => {
        let actor: SafeAuditActor | null = null;
        const rawActor = rec.actor as {
          id: string;
          email?: string | null;
          displayName?: string | null;
          name?: string | null;
        } | null;

        if (rawActor) {
          actor = {
            id: rawActor.id,
            email: rawActor.email ?? null,
            name: rawActor.displayName || rawActor.name || null,
          };
        } else if (typeof rec.actorId === "string" && rec.actorId) {
          actor = {
            id: rec.actorId,
            email: null,
            name: null,
          };
        }

        const createdAtStr =
          rec.createdAt instanceof Date
            ? rec.createdAt.toISOString()
            : String(rec.createdAt);

        return {
          id: String(rec.id),
          action: String(rec.action),
          scopeType: String(rec.scopeType),
          scopeId: typeof rec.scopeId === "string" ? rec.scopeId : null,
          resourceType: typeof rec.resourceType === "string" ? rec.resourceType : null,
          resourceId: typeof rec.resourceId === "string" ? rec.resourceId : null,
          createdAt: createdAtStr,
          actorId: typeof rec.actorId === "string" ? rec.actorId : null,
          actor,
          metadata: sanitizeAuditMetadata(rec.metadata, String(rec.action)),
        };
      });

      const totalPages = Math.max(1, Math.ceil(total / limit));
      const hasMore = page < totalPages;

      return {
        items,
        total,
        page,
        limit,
        totalPages,
        hasMore,
      };
    } catch (err: unknown) {
      if (err instanceof AuditServiceError) {
        throw err;
      }
      console.error("[AuditService] Database error querying audit logs:", err);
      throw new AuditServiceError(
        "DATABASE_ERROR",
        "Database query failed while retrieving audit records",
        500
      );
    }
  }
}

let auditServiceInstance: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditService();
  }
  return auditServiceInstance;
}
