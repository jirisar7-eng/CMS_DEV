import { calculateEffectiveSessionLifetime } from "@/lib/auth/session-policy";
import { formatSessionDeviceLabel } from "./user-agent";
import {
  ListSessionsOptions,
  RevokeOtherSessionsResult,
  RevokeSessionResult,
  SafeSessionProjection,
  SessionServiceError,
} from "./contracts";

export interface SessionRecord {
  id: string;
  userId: string;
  userAgent?: string | null;
  createdAt: Date;
  lastSeenAt?: Date | null;
  expiresAt: Date;
  idleExpiresAt?: Date | null;
  revokedAt?: Date | null;
}

export interface SessionStoreTransaction {
  session: {
    findUnique(args: { where: { id: string } }): Promise<SessionRecord | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface SessionStore {
  findMany(args: {
    where: Record<string, unknown>;
    take?: number;
    orderBy?: Array<Record<string, "asc" | "desc">>;
  }): Promise<SessionRecord[]>;
  findUnique(args: { where: { id: string } }): Promise<SessionRecord | null>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  $transaction<T>(fn: (tx: SessionStoreTransaction) => Promise<T>): Promise<T>;
}

export interface AuthenticatedActor {
  id: string;
  status: string;
}

export interface SessionServiceDependencies {
  store?: SessionStore;
  getCurrentActorFn?: () => Promise<{
    session: { id: string; userId: string } | null;
    user: AuthenticatedActor | null;
  }>;
  hasPermissionFn?: (
    userId: string,
    permissionKey: string,
    projectId?: string | null,
  ) => Promise<boolean>;
  logAuditFn?: (args: {
    action: string;
    scopeType: string;
    actorId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    tx?: unknown;
  }) => Promise<void>;
  nowFn?: () => Date;
}

const MAX_SESSIONS_LIMIT = 100;
const SESSION_ID_MAX_LEN = 128;

export class SessionService {
  private store: SessionStore | null;
  private getCurrentActorFn?: () => Promise<{
    session: { id: string; userId: string } | null;
    user: AuthenticatedActor | null;
  }>;
  private hasPermissionFn?: (
    userId: string,
    permissionKey: string,
    projectId?: string | null,
  ) => Promise<boolean>;
  private logAuditFn?: (args: {
    action: string;
    scopeType: string;
    actorId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    tx?: unknown;
  }) => Promise<void>;
  private nowFn: () => Date;

  constructor(deps?: SessionServiceDependencies) {
    this.store = deps?.store ?? null;
    this.getCurrentActorFn = deps?.getCurrentActorFn;
    this.hasPermissionFn = deps?.hasPermissionFn;
    this.logAuditFn = deps?.logAuditFn;
    this.nowFn = deps?.nowFn ?? (() => new Date());
  }

  private async getStore(): Promise<SessionStore> {
    if (this.store) return this.store;
    const { isDatabaseConfigured } = await import("@/lib/runtime/database");
    if (!isDatabaseConfigured()) {
      throw new SessionServiceError("DATABASE_ERROR", "Database service is not configured", 500);
    }
    const { prisma } = await import("@/lib/db");
    return {
      findMany: (args) => (prisma.session as unknown as SessionStore).findMany(args),
      findUnique: (args) => (prisma.session as unknown as SessionStore).findUnique(args),
      updateMany: (args) => (prisma.session as unknown as SessionStore).updateMany(args),
      $transaction: (fn) => (prisma as unknown as SessionStore).$transaction(fn),
    };
  }

  private async resolveActor(requestingActor?: {
    userId: string;
    currentSessionId: string;
  }): Promise<{ actorId: string; currentSessionId: string }> {
    if (requestingActor?.userId && requestingActor?.currentSessionId) {
      return {
        actorId: requestingActor.userId,
        currentSessionId: requestingActor.currentSessionId,
      };
    }

    if (this.getCurrentActorFn) {
      const res = await this.getCurrentActorFn();
      if (!res.session?.id || !res.user?.id || res.user.status !== "ACTIVE") {
        throw new SessionServiceError("UNAUTHENTICATED", "Authentication required", 401);
      }
      return {
        actorId: res.user.id,
        currentSessionId: res.session.id,
      };
    }

    const { getSession } = await import("@/lib/auth/session");
    const { session, user } = await getSession();
    if (!session?.id || !user?.id || user.status !== "ACTIVE") {
      throw new SessionServiceError("UNAUTHENTICATED", "Authentication required", 401);
    }
    return {
      actorId: user.id,
      currentSessionId: session.id,
    };
  }

  private async checkExactPermission(
    userId: string,
    permissionKey: string,
  ): Promise<boolean> {
    try {
      if (this.hasPermissionFn) {
        return await this.hasPermissionFn(userId, permissionKey, null);
      }
      const { hasPermission } = await import("@/lib/auth/rbac");
      return await hasPermission(userId, permissionKey as any, null);
    } catch {
      // Fail closed on any error
      return false;
    }
  }

  /**
   * Lists active sessions for self or foreign user with strict permission checks,
   * deterministic lifetime recalculation, and safe projection.
   */
  async listSessions(
    options?: ListSessionsOptions,
    requestingActor?: { userId: string; currentSessionId: string },
  ): Promise<SafeSessionProjection[]> {
    const { actorId, currentSessionId } = await this.resolveActor(requestingActor);
    const targetUserId = options?.targetUserId?.trim() || actorId;

    // Authorization check
    if (targetUserId !== actorId) {
      // Foreign list requires exact global users.view authority
      const canViewUsers = await this.checkExactPermission(actorId, "users.view");
      if (!canViewUsers) {
        throw new SessionServiceError(
          "FORBIDDEN",
          "Forbidden: insufficient permissions to view user sessions",
          403,
        );
      }
    }

    try {
      const store = await this.getStore();
      const now = this.nowFn();

      const candidates = await store.findMany({
        where: {
          userId: targetUserId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        take: MAX_SESSIONS_LIMIT,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });

      const activeSessions: SafeSessionProjection[] = [];

      for (const session of candidates) {
        const { effectiveExpiresAt, effectiveIdleExpiresAt } =
          calculateEffectiveSessionLifetime({
            createdAt: session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt),
            lastSeenAt: session.lastSeenAt ? (session.lastSeenAt instanceof Date ? session.lastSeenAt : new Date(session.lastSeenAt)) : null,
            expiresAt: session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt),
            idleExpiresAt: session.idleExpiresAt ? (session.idleExpiresAt instanceof Date ? session.idleExpiresAt : new Date(session.idleExpiresAt)) : null,
          });

        const nowMs = now.getTime();
        if (nowMs >= effectiveExpiresAt.getTime() || nowMs >= effectiveIdleExpiresAt.getTime()) {
          // Session is expired under CMS 1.0 hardened lifetime policy
          continue;
        }

        const createdAtDate = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt);
        const lastSeenDate = session.lastSeenAt
          ? (session.lastSeenAt instanceof Date ? session.lastSeenAt : new Date(session.lastSeenAt))
          : createdAtDate;

        activeSessions.push({
          id: session.id,
          userId: session.userId,
          deviceLabel: formatSessionDeviceLabel(session.userAgent),
          createdAt: createdAtDate.toISOString(),
          lastSeenAt: lastSeenDate.toISOString(),
          expiresAt: effectiveExpiresAt.toISOString(),
          isCurrent: session.id === currentSessionId,
        });
      }

      return activeSessions;
    } catch (err: unknown) {
      if (err instanceof SessionServiceError) {
        throw err;
      }
      throw new SessionServiceError("DATABASE_ERROR", "Failed to retrieve session list", 500);
    }
  }

  /**
   * Revokes a single session by its unique ID with strict authorization, IDOR protection,
   * current session protection, and transactional audit logging.
   */
  async revokeSessionById(
    sessionId: string,
    requestingActor?: { userId: string; currentSessionId: string },
  ): Promise<RevokeSessionResult> {
    const { actorId, currentSessionId } = await this.resolveActor(requestingActor);

    if (
      !sessionId ||
      typeof sessionId !== "string" ||
      sessionId.trim().length === 0 ||
      sessionId.trim().length > SESSION_ID_MAX_LEN ||
      /[\x00-\x1F\x7F]/.test(sessionId)
    ) {
      throw new SessionServiceError("INVALID_INPUT", "Invalid session identifier", 400);
    }

    const cleanSessionId = sessionId.trim();

    try {
      const store = await this.getStore();
      const now = this.nowFn();

      return await store.$transaction(async (tx) => {
        const targetSession = await tx.session.findUnique({
          where: { id: cleanSessionId },
        });

        if (!targetSession || targetSession.revokedAt !== null) {
          throw new SessionServiceError("NOT_FOUND", "Session not found", 404);
        }

        // Authorization check
        if (targetSession.userId === actorId) {
          // Self-service: cannot revoke current session via management endpoint
          if (targetSession.id === currentSessionId) {
            throw new SessionServiceError(
              "CURRENT_SESSION_PROTECTED",
              "Cannot revoke current active session. Use logout instead.",
              400,
            );
          }
        } else {
          // Foreign revoke requires exact global users.manage authority
          const canManageUsers = await this.checkExactPermission(actorId, "users.manage");
          if (!canManageUsers) {
            throw new SessionServiceError(
              "FORBIDDEN",
              "Forbidden: insufficient permissions to revoke foreign session",
              403,
            );
          }
        }

        const updateResult = await tx.session.updateMany({
          where: {
            id: cleanSessionId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new SessionServiceError("NOT_FOUND", "Session not found or already revoked", 404);
        }

        // Write audit log inside the same transaction
        if (this.logAuditFn) {
          await this.logAuditFn({
            action: "AUTH_SESSION_REVOKED",
            scopeType: "SYSTEM",
            actorId,
            resourceType: "Session",
            resourceId: cleanSessionId,
            metadata: {
              targetUserId: targetSession.userId,
              revokeMode: "SINGLE",
              revokedCount: 1,
            },
            tx,
          });
        } else {
          await tx.auditLog.create({
            data: {
              action: "AUTH_SESSION_REVOKED",
              scopeType: "SYSTEM",
              actorId,
              resourceType: "Session",
              resourceId: cleanSessionId,
              metadata: {
                targetUserId: targetSession.userId,
                revokeMode: "SINGLE",
                revokedCount: 1,
              },
            },
          });
        }

        return {
          success: true,
          sessionId: cleanSessionId,
          revokedCount: 1,
        };
      });
    } catch (err: unknown) {
      if (err instanceof SessionServiceError) {
        throw err;
      }
      throw new SessionServiceError("DATABASE_ERROR", "Database transaction failed during session revocation", 500);
    }
  }

  /**
   * Revokes all other non-current sessions for the active user in a single transaction with audit.
   */
  async revokeOtherSessions(
    requestingActor?: { userId: string; currentSessionId: string },
  ): Promise<RevokeOtherSessionsResult> {
    const { actorId, currentSessionId } = await this.resolveActor(requestingActor);

    try {
      const store = await this.getStore();
      const now = this.nowFn();

      return await store.$transaction(async (tx) => {
        const updateResult = await tx.session.updateMany({
          where: {
            userId: actorId,
            id: { not: currentSessionId },
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        const count = updateResult.count;

        // Transactional audit log
        if (this.logAuditFn) {
          await this.logAuditFn({
            action: "AUTH_SESSION_REVOKED",
            scopeType: "SYSTEM",
            actorId,
            resourceType: "User",
            resourceId: actorId,
            metadata: {
              targetUserId: actorId,
              revokeMode: "OTHERS",
              revokedCount: count,
            },
            tx,
          });
        } else {
          await tx.auditLog.create({
            data: {
              action: "AUTH_SESSION_REVOKED",
              scopeType: "SYSTEM",
              actorId,
              resourceType: "User",
              resourceId: actorId,
              metadata: {
                targetUserId: actorId,
                revokeMode: "OTHERS",
                revokedCount: count,
              },
            },
          });
        }

        return {
          success: true,
          revokedCount: count,
        };
      });
    } catch (err: unknown) {
      if (err instanceof SessionServiceError) {
        throw err;
      }
      throw new SessionServiceError("DATABASE_ERROR", "Database transaction failed during bulk revocation", 500);
    }
  }
}

let sessionServiceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService();
  }
  return sessionServiceInstance;
}

export function setSessionServiceForTesting(service: SessionService | null): void {
  sessionServiceInstance = service;
}
