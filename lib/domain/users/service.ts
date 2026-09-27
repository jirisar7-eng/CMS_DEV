import type { Prisma, PrismaClient } from "@prisma/client";
import { PermissionKey } from "@/lib/auth/rbac";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { logAudit } from "@/lib/auth/audit";
import {
  validateCreateUserInput,
  validatePatchUserInput,
  validateUserStatus,
} from "./validation";
import type {
  CreateUserInput,
  ListUsersOptions,
  ListUsersResult,
  PatchUserInput,
  SafeUserRecord,
  UserErrorCode,
} from "./types";

export function getStatusForUserErrorCode(code: UserErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "INVALID_INPUT":
    case "CANNOT_DEACTIVATE_SELF":
    case "CANNOT_DEACTIVATE_LAST_ADMIN":
      return 400;
    case "EMAIL_EXISTS":
    case "INVALID_USER_STATE":
      return 409;
    case "DATABASE_ERROR":
    default:
      return 500;
  }
}

export class UserDomainError extends Error {
  public readonly status: number;

  constructor(
    public readonly code: UserErrorCode,
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "UserDomainError";
    this.status = status ?? getStatusForUserErrorCode(code);
  }
}

export function toSafeUserRecord(user: {
  id: string;
  email: string;
  displayName?: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  roles?: Array<{
    projectId: string | null;
    role?: { name: string } | null;
  }> | null;
  mfa?: { status: string } | null;
}): SafeUserRecord {
  const globalRoles: string[] = [];
  if (Array.isArray(user.roles)) {
    for (const ur of user.roles) {
      if (ur.projectId === null && ur.role && typeof ur.role.name === "string") {
        globalRoles.push(ur.role.name);
      }
    }
  }
  globalRoles.sort((a, b) => a.localeCompare(b));

  const hasMfa = Boolean(user.mfa && user.mfa.status === "ENABLED");

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    status: user.status,
    globalRoles,
    hasMfa,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt),
  };
}

export interface UserServiceDependencies {
  prisma?: PrismaClient | Prisma.TransactionClient;
  hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;
}

export class UserService {
  private customDb?: PrismaClient | Prisma.TransactionClient;
  private hasPermissionFn?: (
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ) => Promise<boolean>;

  constructor(deps?: UserServiceDependencies) {
    this.customDb = deps?.prisma;
    this.hasPermissionFn = deps?.hasPermissionFn;
  }

  private async getDb(): Promise<PrismaClient> {
    if (this.customDb) return this.customDb as PrismaClient;
    const { prisma } = await import("@/lib/db");
    return prisma as PrismaClient;
  }

  private async checkPermission(
    userId: string,
    permissionKey: PermissionKey,
    projectId?: string | null
  ): Promise<boolean> {
    if (!userId) {
      return false;
    }
    try {
      if (this.hasPermissionFn) {
        return await this.hasPermissionFn(userId, permissionKey, projectId);
      }
      const { hasPermission } = await import("@/lib/auth/rbac");
      return await hasPermission(userId, permissionKey, projectId);
    } catch (err) {
      console.error("[UserService] Authorization evaluation error:", err);
      return false;
    }
  }

  private async resolveActorId(actorId?: string): Promise<string> {
    if (actorId && typeof actorId === "string" && actorId.trim().length > 0) {
      return actorId.trim();
    }
    try {
      const { getSession } = await import("@/lib/auth/session");
      const { user } = await getSession();
      if (user && user.status === "ACTIVE") {
        return user.id;
      }
    } catch {
      // Non-request context
    }
    throw new UserDomainError("UNAUTHENTICATED", "Authentication required", 401);
  }

  async listUsers(
    options: ListUsersOptions = {},
    actorId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<ListUsersResult> {
    const resolvedActorId = await this.resolveActorId(actorId);

    const canView = await this.checkPermission(resolvedActorId, "users.view", null);
    if (!canView) {
      throw new UserDomainError("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }

    let page = 1;
    if (options.page !== undefined) {
      if (typeof options.page !== "number" || !Number.isInteger(options.page) || options.page < 1) {
        throw new UserDomainError("INVALID_INPUT", "Invalid page: must be a positive integer", 400);
      }
      page = options.page;
    }

    let limit = 20;
    if (options.limit !== undefined) {
      if (typeof options.limit !== "number" || !Number.isInteger(options.limit) || options.limit < 1) {
        throw new UserDomainError("INVALID_INPUT", "Invalid limit: must be a positive integer", 400);
      }
      limit = Math.min(options.limit, 100);
    }

    const skip = (page - 1) * limit;
    if (skip > 1_000_000) {
      throw new UserDomainError("INVALID_INPUT", "Requested page offset exceeds maximum allowed range", 400);
    }

    const where: Record<string, unknown> = {};

    if (options.status !== undefined) {
      const statusRes = validateUserStatus(options.status);
      if (!statusRes.valid || !statusRes.status) {
        throw new UserDomainError("INVALID_INPUT", "Invalid status filter: must be ACTIVE or DISABLED", 400);
      }
      where.status = statusRes.status;
    }

    if (options.query !== undefined) {
      if (typeof options.query !== "string") {
        throw new UserDomainError("INVALID_INPUT", "Query filter must be a string", 400);
      }
      const trimmed = options.query.trim();
      if (trimmed.length > 255) {
        throw new UserDomainError("INVALID_INPUT", "Query filter exceeds maximum length", 400);
      }
      if (trimmed.length > 0) {
        where.OR = [
          { email: { contains: trimmed, mode: "insensitive" } },
          { displayName: { contains: trimmed, mode: "insensitive" } },
        ];
      }
    }

    try {
      const db = tx ?? (await this.getDb());
      const [total, users] = await Promise.all([
        db.user.count({ where }),
        db.user.findMany({
          where,
          take: limit,
          skip,
          orderBy: [
            { createdAt: "desc" },
            { id: "asc" },
          ],
          include: {
            roles: {
              where: { projectId: null },
              include: {
                role: { select: { name: true } },
              },
            },
            mfa: {
              select: { status: true },
            },
          },
        }),
      ]);

      const items = users.map(toSafeUserRecord);
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
      if (err instanceof UserDomainError) {
        throw err;
      }
      console.error("[UserService.listUsers] Unexpected error:", err);
      throw new UserDomainError("DATABASE_ERROR", "A database error occurred", 500);
    }
  }

  async getUserById(
    userId: string,
    actorId?: string,
    tx?: Prisma.TransactionClient
  ): Promise<SafeUserRecord> {
    const resolvedActorId = await this.resolveActorId(actorId);

    const canView = await this.checkPermission(resolvedActorId, "users.view", null);
    if (!canView) {
      throw new UserDomainError("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      throw new UserDomainError("INVALID_INPUT", "User ID is required", 400);
    }
    const cleanUserId = userId.trim();

    try {
      const db = tx ?? (await this.getDb());
      const user = await db.user.findUnique({
        where: { id: cleanUserId },
        include: {
          roles: {
            where: { projectId: null },
            include: {
              role: { select: { name: true } },
            },
          },
          mfa: {
            select: { status: true },
          },
        },
      });

      if (!user) {
        throw new UserDomainError("NOT_FOUND", "User not found", 404);
      }

      return toSafeUserRecord(user);
    } catch (err: unknown) {
      if (err instanceof UserDomainError) {
        throw err;
      }
      console.error("[UserService.getUserById] Unexpected error:", err);
      throw new UserDomainError("DATABASE_ERROR", "A database error occurred", 500);
    }
  }

  async createUser(
    input: CreateUserInput,
    actorId?: string,
    externalTx?: Prisma.TransactionClient
  ): Promise<SafeUserRecord> {
    const resolvedActorId = await this.resolveActorId(actorId);

    const canManage = await this.checkPermission(resolvedActorId, "users.manage", null);
    if (!canManage) {
      throw new UserDomainError("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }

    const validation = validateCreateUserInput(input);
    if (!validation.valid || !validation.data) {
      const firstError = validation.errors
        ? Object.values(validation.errors)[0]
        : "Invalid user input";
      throw new UserDomainError("INVALID_INPUT", firstError, 400);
    }
    const { email, password, displayName } = validation.data;

    const passwordHash = await hashPassword(password);

    const db = await this.getDb();
    const execute = async (tx: Prisma.TransactionClient) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        throw new UserDomainError("EMAIL_EXISTS", `User with email "${email}" already exists`, 409);
      }

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: displayName ?? null,
          status: "ACTIVE",
        },
        include: {
          roles: {
            where: { projectId: null },
            include: {
              role: { select: { name: true } },
            },
          },
          mfa: {
            select: { status: true },
          },
        },
      });

      await logAudit({
        action: "USER_CREATED",
        scopeType: "SYSTEM",
        actorId: resolvedActorId,
        resourceType: "User",
        resourceId: user.id,
        metadata: {
          targetUserId: user.id,
          email: user.email,
          displayName: user.displayName,
        },
        tx,
      });

      return toSafeUserRecord(user);
    };

    try {
      if (externalTx) {
        return await execute(externalTx);
      }
      return await db.$transaction(execute);
    } catch (err: unknown) {
      if (err instanceof UserDomainError) {
        throw err;
      }
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new UserDomainError("EMAIL_EXISTS", `User with email "${email}" already exists`, 409);
      }
      console.error("[UserService.createUser] Unexpected error:", err);
      throw new UserDomainError("DATABASE_ERROR", "A database error occurred", 500);
    }
  }

  async updateUser(
    userId: string,
    input: PatchUserInput,
    actorId?: string,
    externalTx?: Prisma.TransactionClient
  ): Promise<SafeUserRecord> {
    const resolvedActorId = await this.resolveActorId(actorId);

    const canManage = await this.checkPermission(resolvedActorId, "users.manage", null);
    if (!canManage) {
      throw new UserDomainError("FORBIDDEN", "Forbidden: insufficient permissions", 403);
    }

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      throw new UserDomainError("INVALID_INPUT", "User ID is required", 400);
    }
    const cleanUserId = userId.trim();

    const validation = validatePatchUserInput(input);
    if (!validation.valid || !validation.data) {
      const firstError = validation.errors
        ? Object.values(validation.errors)[0]
        : "Invalid patch input";
      throw new UserDomainError("INVALID_INPUT", firstError, 400);
    }
    const patchData = validation.data;

    // Reject self-deactivation before transaction
    if (patchData.status === "DISABLED" && cleanUserId === resolvedActorId) {
      throw new UserDomainError("CANNOT_DEACTIVATE_SELF", "Users cannot deactivate their own account", 400);
    }

    const db = await this.getDb();
    const execute = async (tx: Prisma.TransactionClient) => {
      // Deterministic row locking in sorted ID order
      if (typeof (tx as unknown as { $queryRaw?: unknown }).$queryRaw === "function") {
        const idsToLock = Array.from(new Set([resolvedActorId, cleanUserId])).sort((a, b) =>
          a.localeCompare(b)
        );
        for (const id of idsToLock) {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
        }
      }

      // Re-check actor exists and is ACTIVE inside transaction
      const actor = await tx.user.findUnique({
        where: { id: resolvedActorId },
        select: { id: true, status: true },
      });
      if (!actor || actor.status !== "ACTIVE") {
        throw new UserDomainError("FORBIDDEN", "Actor is not active or does not exist", 403);
      }

      // Target must also exist after locking
      const targetUser = await tx.user.findUnique({
        where: { id: cleanUserId },
        include: {
          roles: {
            where: { projectId: null },
            include: {
              role: { select: { name: true } },
            },
          },
          mfa: {
            select: { status: true },
          },
        },
      });
      if (!targetUser) {
        throw new UserDomainError("NOT_FOUND", "User not found", 404);
      }

      // Re-verify self-deactivation inside transaction
      if (patchData.status === "DISABLED" && cleanUserId === resolvedActorId) {
        throw new UserDomainError("CANNOT_DEACTIVATE_SELF", "Users cannot deactivate their own account", 400);
      }

      // SUSPENDED is not an allowed mutation target and cannot transition lifecycle
      if (patchData.status !== undefined && targetUser.status === "SUSPENDED") {
        throw new UserDomainError("INVALID_USER_STATE", "Cannot change status of a SUSPENDED user", 409);
      }

      // Check email uniqueness if changing email
      if (patchData.email !== undefined && patchData.email !== targetUser.email) {
        const emailConflict = await tx.user.findFirst({
          where: {
            email: patchData.email,
            id: { not: cleanUserId },
          },
          select: { id: true },
        });
        if (emailConflict) {
          throw new UserDomainError("EMAIL_EXISTS", `User with email "${patchData.email}" already exists`, 409);
        }
      }

      const updateData: {
        email?: string;
        displayName?: string | null;
        status?: string;
      } = {};

      const nonStatusChangedFields: string[] = [];
      let statusChanged = false;

      if (patchData.email !== undefined && patchData.email !== targetUser.email) {
        updateData.email = patchData.email;
        nonStatusChangedFields.push("email");
      }
      if (patchData.displayName !== undefined && patchData.displayName !== targetUser.displayName) {
        updateData.displayName = patchData.displayName;
        nonStatusChangedFields.push("displayName");
      }
      if (patchData.status !== undefined && patchData.status !== targetUser.status) {
        updateData.status = patchData.status;
        statusChanged = true;
      }

      nonStatusChangedFields.sort((a, b) => a.localeCompare(b));

      // Session revocation:
      // email change => revoke all target user sessions
      // status change => revoke all target user sessions
      // displayName-only change => do NOT revoke sessions
      const shouldRevokeSessions =
        (patchData.email !== undefined && patchData.email !== targetUser.email) || statusChanged;
      if (shouldRevokeSessions) {
        await revokeAllUserSessions(cleanUserId, { tx });
      }

      let updatedUser = targetUser;
      if (Object.keys(updateData).length > 0) {
        updatedUser = await tx.user.update({
          where: { id: cleanUserId },
          data: updateData,
          include: {
            roles: {
              where: { projectId: null },
              include: {
                role: { select: { name: true } },
              },
            },
            mfa: {
              select: { status: true },
            },
          },
        });
      }

      // Audit logging
      if (statusChanged && patchData.status) {
        await logAudit({
          action: "USER_STATUS_CHANGED",
          scopeType: "SYSTEM",
          actorId: resolvedActorId,
          resourceType: "User",
          resourceId: cleanUserId,
          metadata: {
            targetUserId: cleanUserId,
            status: patchData.status,
            previousStatus: targetUser.status,
          },
          tx,
        });
      }

      if (nonStatusChangedFields.length > 0) {
        await logAudit({
          action: "USER_UPDATED",
          scopeType: "SYSTEM",
          actorId: resolvedActorId,
          resourceType: "User",
          resourceId: cleanUserId,
          metadata: {
            targetUserId: cleanUserId,
            changedFields: nonStatusChangedFields,
          },
          tx,
        });
      }

      return toSafeUserRecord(updatedUser);
    };

    try {
      if (externalTx) {
        return await execute(externalTx);
      }
      return await db.$transaction(execute);
    } catch (err: unknown) {
      if (err instanceof UserDomainError) {
        throw err;
      }
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new UserDomainError("EMAIL_EXISTS", "A user with this email already exists", 409);
      }
      console.error("[UserService.updateUser] Unexpected error:", err);
      throw new UserDomainError("DATABASE_ERROR", "A database error occurred", 500);
    }
  }
}

let defaultUserService: UserService | null = null;

export function getUserService(deps?: UserServiceDependencies): UserService {
  if (deps) {
    return new UserService(deps);
  }
  if (!defaultUserService) {
    defaultUserService = new UserService();
  }
  return defaultUserService;
}

export function setUserServiceForTesting(service: UserService | null): void {
  defaultUserService = service;
}

export async function listUsers(
  options: ListUsersOptions = {},
  actorId?: string,
  tx?: Prisma.TransactionClient
): Promise<ListUsersResult> {
  return getUserService().listUsers(options, actorId, tx);
}

export async function getUserById(
  userId: string,
  actorId?: string,
  tx?: Prisma.TransactionClient
): Promise<SafeUserRecord> {
  return getUserService().getUserById(userId, actorId, tx);
}

export async function createUser(
  input: CreateUserInput,
  actorId?: string,
  tx?: Prisma.TransactionClient
): Promise<SafeUserRecord> {
  return getUserService().createUser(input, actorId, tx);
}

export async function updateUser(
  userId: string,
  input: PatchUserInput,
  actorId?: string,
  externalTx?: Prisma.TransactionClient
): Promise<SafeUserRecord> {
  return getUserService().updateUser(userId, input, actorId, externalTx);
}
