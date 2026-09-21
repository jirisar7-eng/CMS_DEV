import { PermissionKey } from "@/lib/auth/rbac";
import {
  AuditLogQueryOptions,
  AuditLogsQueryResult,
  AuditScopeType,
  AuditServiceError,
  SafeAuditActor,
  SafeAuditRecord,
} from "./contracts";

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
    attempt: safeNumber(),
  },
  AUTH_LOGIN_BLOCKED: {
    ip: safeString(100),
    userAgent: safeString(255),
    identifierHash: safeString(100),
    clientIpHash: safeString(100),
    reason: safeString(100),
    retryAfter: safeNumber(),
    attempt: safeNumber(),
  },
  AUTH_LOGOUT: {
    userId: safeString(100),
  },
  AUTH_SESSION_REVOKED: {
    targetUserId: safeString(100),
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
    lockVersion: safeNumber(),
    key: safeString(100),
  },
  CONTENT_DRAFT_UPDATED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    lockVersion: safeNumber(),
    changedFields: safeStringArray(50, 100),
  },
  CONTENT_REVIEW_SUBMITTED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    lockVersion: safeNumber(),
    fromStatus: safeString(50),
    toStatus: safeString(50),
  },
  CONTENT_REVIEW_APPROVED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    lockVersion: safeNumber(),
    fromStatus: safeString(50),
    toStatus: safeString(50),
  },
  CONTENT_CHANGES_REQUESTED: {
    pageId: safeString(100),
    revisionId: safeString(100),
    revisionNumber: safeNumber(),
    fromStatus: safeString(50),
    toStatus: safeString(50),
  },
  CONTENT_RELEASE_PUBLISHED: {
    pageId: safeString(100),
    releaseId: safeString(100),
    revisionId: safeString(100),
    releaseVersion: safeString(100),
    previousRevisionId: safeString(100),
  },
  CONTENT_RELEASE_ROLLED_BACK: {
    pageId: safeString(100),
    rollbackReleaseId: safeString(100),
    sourcePublishReleaseId: safeString(100),
    fromRevisionId: safeString(100),
    toRevisionId: safeString(100),
    fromRevisionNumber: safeNumber(),
    toRevisionNumber: safeNumber(),
  },
  CONTENT_DRAFT_REOPENED: {
    pageId: safeString(100),
    sourcePublishedRevisionId: safeString(100),
    newDraftRevisionId: safeString(100),
    newDraftRevisionNumber: safeNumber(),
    lockVersion: safeNumber(),
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
    key: safeString(100),
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
  theme: safeString(100),
  attempt: safeNumber(),
};

const SAFE_EXEMPT_KEYS = new Set([
  "updatedKeys",
  "pageKey",
  "key",
]);

export function isSensitiveKey(key: string): boolean {
  if (SAFE_EXEMPT_KEYS.has(key)) return false;
  const lower = key.toLowerCase();

  if (lower.includes("password") || lower.includes("pwd") || lower === "pass") return true;
  if (lower.includes("token") || lower.includes("jwt") || lower.includes("bearer")) return true;
  if (lower.includes("secret")) return true;
  if (lower.includes("credential")) return true;
  if (lower.includes("cookie")) return true;
  if (lower.includes("authorization") || lower.includes("authtoken") || lower.includes("authheader") || lower === "auth") return true;
  if (lower.includes("apikey") || lower.includes("secretkey") || lower.includes("privatekey") || lower.includes("accesskey") || lower.includes("encryptionkey") || lower.includes("signingkey")) return true;
  if (lower.includes("passwordhash") || lower.includes("hash_secret") || lower.includes("secrethash") || lower.includes("hashsecret")) return true;
  if (lower.includes("signature") || lower === "sig") return true;
  if (lower.includes("certificate") || lower === "cert") return true;
  if (lower.includes("privatekey") || lower === "private") return true;

  return false;
}

const SENSITIVE_VALUE_REGEX = /(^bearer\s+|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|\b(ghp|sk_live|sk_test|secret)_[A-Za-z0-9_-]{8,})/i;

export function redactSensitiveString(str: string): string {
  if (SENSITIVE_VALUE_REGEX.test(str)) {
    return "[REDACTED]";
  }
  return str;
}

export function redactSensitiveData(val: unknown): unknown {
  if (val === null || val === undefined) {
    return undefined;
  }
  if (typeof val === "string") {
    return redactSensitiveString(val);
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return val;
  }
  if (Array.isArray(val)) {
    const cleaned = val
      .map((item) => redactSensitiveData(item))
      .filter((item) => item !== undefined);
    return cleaned;
  }
  if (typeof val === "object") {
    const rawObj = val as Record<string, unknown>;
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawObj)) {
      if (isSensitiveKey(k)) {
        continue;
      }
      const cleaned = redactSensitiveData(v);
      if (cleaned !== undefined) {
        res[k] = cleaned;
      }
    }
    return Object.keys(res).length > 0 ? res : undefined;
  }
  return undefined;
}

export interface SanitizeAuditMetadataOptions {
  mode?: "write" | "read";
}

/**
 * Shared audit metadata sanitization policy.
 * - Enforces schema allowlisting for registered events.
 * - Recursively redacts secrets, credentials, tokens, cookies, and nested sensitive objects.
 * - Used on the write path before DB insertion and on the read path as defense-in-depth.
 */
export function sanitizeAuditMetadata(
  raw: unknown,
  action?: string,
  options?: SanitizeAuditMetadataOptions
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const rawObj = raw as Record<string, unknown>;
  const mode = options?.mode ?? "read";

  if (action && EVENT_METADATA_SCHEMAS[action]) {
    const schema = EVENT_METADATA_SCHEMAS[action];
    const result: Record<string, unknown> = {};
    for (const [key, validator] of Object.entries(schema)) {
      if (key in rawObj) {
        const val = rawObj[key];
        const validated = validator(val);
        if (validated !== undefined) {
          const redacted = redactSensitiveData(validated);
          if (redacted !== undefined) {
            result[key] = redacted;
          }
        }
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  // Unregistered / unknown event actions
  if (mode === "write") {
    const redacted = redactSensitiveData(rawObj);
    if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
      const keys = Object.keys(redacted as Record<string, unknown>);
      return keys.length > 0 ? (redacted as Record<string, unknown>) : null;
    }
  }

  // On read path, unregistered event metadata is projected to null
  return null;
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

export interface SafeHttpErrorResponse {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      status: number;
    };
  };
}

export function mapAuditErrorToResponse(err: unknown): SafeHttpErrorResponse {
  if (err instanceof AuditServiceError) {
    const status = err.status || 500;
    const message =
      status >= 500
        ? "An unexpected error occurred while retrieving audit logs"
        : err.message;
    return {
      status,
      body: {
        error: {
          code: err.code,
          message,
          status,
        },
      },
    };
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    "message" in err &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  ) {
    const apiErr = err as { code: string; message: string; status: number };
    return {
      status: apiErr.status,
      body: {
        error: {
          code: apiErr.code,
          message: apiErr.message,
          status: apiErr.status,
        },
      },
    };
  }
  if (err instanceof Error) {
    if (err.message === "UNAUTHENTICATED") {
      return {
        status: 401,
        body: { error: { code: "UNAUTHENTICATED", message: "Authentication required", status: 401 } },
      };
    }
    if (err.message === "DATABASE_UNAVAILABLE") {
      return {
        status: 503,
        body: { error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable", status: 503 } },
      };
    }
    if (err.message === "FORBIDDEN") {
      return {
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "Forbidden: insufficient permissions", status: 403 } },
      };
    }
    if (err.message === "CSRF_REJECTED") {
      return {
        status: 403,
        body: { error: { code: "CSRF_REJECTED", message: "Cross-origin request rejected", status: 403 } },
      };
    }
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", status: 500 } },
  };
}

export function handleAuditApiError(err: unknown): Response {
  const mapped = mapAuditErrorToResponse(err);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
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

export function setAuditServiceForTesting(service: AuditService | null): void {
  auditServiceInstance = service;
}
