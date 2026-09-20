import {
  AuditLogQueryOptions,
  AuditLogsQueryResult,
  AuditServiceError,
  SafeAuditRecord,
  SafeAuditActor,
} from "./contracts";
import type { PermissionKey } from "@/lib/auth/rbac";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "authheader",
  "cookie",
  "sessiontoken",
  "privatekey",
  "apikey",
  "clientsecret",
  "credential",
  "credentials",
]);

export function sanitizeAuditMetadata(
  raw: unknown
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = "[REDACTED]";
      continue;
    }

    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        result[key] = val.map((item) =>
          typeof item === "object" && item !== null
            ? sanitizeAuditMetadata(item)
            : item
        );
      } else {
        result[key] = sanitizeAuditMetadata(val);
      }
    } else {
      result[key] = val;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
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
    const rawLimit = Number(options.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;

    const rawPage = Number(options.page);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const skip = (page - 1) * limit;

    // 3. Construct Prisma WHERE filter
    const where: Record<string, unknown> = {};

    if (projectId) {
      // Strict project isolation: only PROJECT scope with matching scopeId
      where.scopeType = "PROJECT";
      where.scopeId = projectId;
    } else {
      // Global / System query
      if (options.scopeType === "SYSTEM") {
        where.scopeType = "SYSTEM";
      } else if (options.scopeType === "PROJECT") {
        where.scopeType = "PROJECT";
      }
      // If options.scopeType is "ALL" or undefined, global authorized viewer can see all records
    }

    if (options.action && options.action.trim()) {
      where.action = options.action.trim();
    }

    if (options.resourceType && options.resourceType.trim()) {
      where.resourceType = options.resourceType.trim();
    }

    // Date range filters
    if (options.from || options.to) {
      const createdAtFilter: Record<string, Date> = {};
      if (options.from) {
        const fromDate = options.from instanceof Date ? options.from : new Date(options.from);
        if (isNaN(fromDate.getTime())) {
          throw new AuditServiceError("INVALID_DATE_FILTER", "Invalid from date filter", 400);
        }
        createdAtFilter.gte = fromDate;
      }
      if (options.to) {
        const toDate = options.to instanceof Date ? options.to : new Date(options.to);
        if (isNaN(toDate.getTime())) {
          throw new AuditServiceError("INVALID_DATE_FILTER", "Invalid to date filter", 400);
        }
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
        const rawActor = rec.actor as { id: string; email?: string | null; displayName?: string | null; name?: string | null } | null;
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

        const createdAtStr = rec.createdAt instanceof Date ? rec.createdAt.toISOString() : String(rec.createdAt);

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
          metadata: sanitizeAuditMetadata(rec.metadata),
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
      // Re-throw database/system errors truthfully so callers do NOT treat them as empty results
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
