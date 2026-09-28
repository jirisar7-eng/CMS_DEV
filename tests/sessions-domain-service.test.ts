import { test } from "node:test";
import assert from "node:assert";
import { formatSessionDeviceLabel } from "@/lib/domain/sessions/user-agent";
import {
  SessionService,
  SessionRecord,
  SessionStore,
  SessionStoreTransaction,
} from "@/lib/domain/sessions/service";
import { SessionServiceError } from "@/lib/domain/sessions/contracts";
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/lib/auth/session-policy";

function createMockStore(initialSessions: SessionRecord[] = []): {
  store: SessionStore;
  sessions: SessionRecord[];
  auditLogs: Array<Record<string, unknown>>;
  txCalls: number;
} {
  const sessions = [...initialSessions];
  const auditLogs: Array<Record<string, unknown>> = [];
  let txCalls = 0;

  const store: SessionStore = {
    async findMany(args: {
      where: Record<string, unknown>;
      take?: number;
      orderBy?: Array<Record<string, "asc" | "desc">>;
    }) {
      const { userId, revokedAt, expiresAt } = args.where as {
        userId?: string;
        revokedAt?: null;
        expiresAt?: { gt?: Date };
      };
      return sessions.filter((s) => {
        if (userId !== undefined && s.userId !== userId) return false;
        if (revokedAt === null && s.revokedAt !== null) return false;
        if (expiresAt?.gt && s.expiresAt <= expiresAt.gt) return false;
        return true;
      });
    },

    async findUnique(args: { where: { id: string } }) {
      return sessions.find((s) => s.id === args.where.id) || null;
    },

    async updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) {
      const { id, userId, revokedAt } = args.where as {
        id?: string | { not?: string };
        userId?: string;
        revokedAt?: null;
      };
      let count = 0;
      for (const s of sessions) {
        if (userId !== undefined && s.userId !== userId) continue;
        if (revokedAt === null && s.revokedAt !== null) continue;
        if (typeof id === "string" && s.id !== id) continue;
        if (typeof id === "object" && id?.not && s.id === id.not) continue;

        if (args.data.revokedAt !== undefined) {
          s.revokedAt = args.data.revokedAt as Date;
        }
        count++;
      }
      return { count };
    },

    async $transaction<T>(fn: (tx: SessionStoreTransaction) => Promise<T>): Promise<T> {
      txCalls++;
      const tx: SessionStoreTransaction = {
        session: {
          findUnique: async (a) => store.findUnique(a),
          updateMany: async (a) => store.updateMany(a),
        },
        auditLog: {
          create: async (a) => {
            auditLogs.push(a.data);
            return a.data;
          },
        },
      };
      return await fn(tx);
    },
  };

  return { store, sessions, auditLogs, get txCalls() { return txCalls; } };
}

test("Session Domain Service - Comprehensive Deterministic Tests", async (t) => {
  const fixedNow = new Date("2026-09-28T12:00:00.000Z");
  const nowFn = () => new Date(fixedNow);

  // 1. Device Label Unit Tests
  await t.test("10. formatSessionDeviceLabel: deterministic parsing across common browsers & OS", () => {
    // Chrome on Windows
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"),
      "Chrome · Windows"
    );
    // Safari on iPhone
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Version/16.5 Mobile/15E148 Safari/604.1"),
      "Safari · iOS · Mobile"
    );
    // Chrome on Android Mobile
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36"),
      "Chrome · Android · Mobile"
    );
    // Firefox on Linux
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0"),
      "Firefox · Linux"
    );
    // Edge on macOS
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Edg/119.0.0.0"),
      "Edge · macOS"
    );
    // Safari on iPad
    assert.strictEqual(
      formatSessionDeviceLabel("Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15"),
      "Safari · iOS · Tablet"
    );
  });

  await t.test("9. formatSessionDeviceLabel: null / empty / unrecognized => Unknown device", () => {
    assert.strictEqual(formatSessionDeviceLabel(null), "Unknown device");
    assert.strictEqual(formatSessionDeviceLabel(undefined), "Unknown device");
    assert.strictEqual(formatSessionDeviceLabel(""), "Unknown device");
    assert.strictEqual(formatSessionDeviceLabel("   "), "Unknown device");
    assert.strictEqual(formatSessionDeviceLabel("custom-bot-scanner/1.0"), "Unknown device");
  });

  // 2. Listing & Self-Service Authorization
  await t.test("1 & 7 & 8: own-session list allowed without permission, assigns isCurrent, hides raw userAgent", async () => {
    const actorId = "user-alice";
    const currentSessionId = "sess-1";

    const s1: SessionRecord = {
      id: "sess-1",
      userId: actorId,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0",
      createdAt: new Date(fixedNow.getTime() - 1000),
      lastSeenAt: new Date(fixedNow.getTime() - 1000),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      idleExpiresAt: new Date(fixedNow.getTime() + SESSION_IDLE_TIMEOUT_MS),
      revokedAt: null,
    };
    const s2: SessionRecord = {
      id: "sess-2",
      userId: actorId,
      userAgent: null,
      createdAt: new Date(fixedNow.getTime() - 5000),
      lastSeenAt: new Date(fixedNow.getTime() - 5000),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      idleExpiresAt: new Date(fixedNow.getTime() + SESSION_IDLE_TIMEOUT_MS),
      revokedAt: null,
    };

    const { store } = createMockStore([s1, s2]);
    const service = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: currentSessionId, userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async () => {
        throw new Error("hasPermission should NOT be called for own session list");
      },
    });

    const list = await service.listSessions();
    assert.strictEqual(list.length, 2);

    const first = list.find((s) => s.id === "sess-1");
    assert.ok(first);
    assert.strictEqual(first.isCurrent, true);
    assert.strictEqual(first.deviceLabel, "Chrome · macOS");
    assert.strictEqual((first as any).userAgent, undefined, "raw userAgent must not be in projection");
    assert.strictEqual((first as any).tokenHash, undefined, "tokenHash must not be in projection");

    const second = list.find((s) => s.id === "sess-2");
    assert.ok(second);
    assert.strictEqual(second.isCurrent, false);
    assert.strictEqual(second.deviceLabel, "Unknown device");
  });

  await t.test("2. listSessions returns ONLY target user's sessions", async () => {
    const actorId = "user-alice";
    const s1: SessionRecord = {
      id: "sess-alice",
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const s2: SessionRecord = {
      id: "sess-bob",
      userId: "user-bob",
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };

    const { store } = createMockStore([s1, s2]);
    const service = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-alice", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
    });

    const list = await service.listSessions({ targetUserId: actorId });
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, "sess-alice");
  });

  await t.test("3 & 4 & 5 & 6: Active returned, revoked and absolute/idle expired sessions excluded", async () => {
    const actorId = "user-alice";
    const active: SessionRecord = {
      id: "sess-active",
      userId: actorId,
      createdAt: new Date(fixedNow.getTime() - 1000),
      lastSeenAt: new Date(fixedNow.getTime() - 1000),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      idleExpiresAt: new Date(fixedNow.getTime() + SESSION_IDLE_TIMEOUT_MS),
      revokedAt: null,
    };
    const revoked: SessionRecord = {
      id: "sess-revoked",
      userId: actorId,
      createdAt: new Date(fixedNow.getTime() - 1000),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: new Date(fixedNow.getTime() - 500),
    };
    const absoluteExpired: SessionRecord = {
      id: "sess-abs-expired",
      userId: actorId,
      createdAt: new Date(fixedNow.getTime() - SESSION_ABSOLUTE_TIMEOUT_MS - 1000),
      expiresAt: new Date(fixedNow.getTime() + 10000), // Stored was large, but createdAt violates policy
      revokedAt: null,
    };
    const idleExpired: SessionRecord = {
      id: "sess-idle-expired",
      userId: actorId,
      createdAt: new Date(fixedNow.getTime() - 3600000),
      lastSeenAt: new Date(fixedNow.getTime() - SESSION_IDLE_TIMEOUT_MS - 1000), // Inactive > idle timeout
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      idleExpiresAt: new Date(fixedNow.getTime() + 10000),
      revokedAt: null,
    };

    const { store } = createMockStore([active, revoked, absoluteExpired, idleExpired]);
    const service = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-active", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
    });

    const list = await service.listSessions();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, "sess-active");
  });

  // 3. Foreign List Authorization
  await t.test("16 & 18 & 19: Foreign list denied without users.view; users.manage alone does NOT grant list", async () => {
    const actorId = "user-alice";
    const targetUserId = "user-bob";
    const { store } = createMockStore([]);

    // No permission
    const serviceNoPerm = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-a", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async () => false,
    });
    await assert.rejects(
      async () => await serviceNoPerm.listSessions({ targetUserId }),
      (err: any) => err instanceof SessionServiceError && err.code === "FORBIDDEN" && err.status === 403
    );

    // users.manage alone does NOT authorize foreign list
    const serviceManageOnly = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-a", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async (_u, perm) => perm === "users.manage",
    });
    await assert.rejects(
      async () => await serviceManageOnly.listSessions({ targetUserId }),
      (err: any) => err instanceof SessionServiceError && err.code === "FORBIDDEN" && err.status === 403
    );

    // Exception in permission checker => DENY
    const serviceThrow = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-a", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async () => {
        throw new Error("RBAC connection error");
      },
    });
    await assert.rejects(
      async () => await serviceThrow.listSessions({ targetUserId }),
      (err: any) => err instanceof SessionServiceError && err.code === "FORBIDDEN" && err.status === 403
    );
  });

  await t.test("17. Foreign list allowed with exact global users.view", async () => {
    const actorId = "user-alice";
    const targetUserId = "user-bob";
    const sBob: SessionRecord = {
      id: "sess-bob-1",
      userId: targetUserId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const { store } = createMockStore([sBob]);

    const service = new SessionService({
      store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-alice-1", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async (_userId, permKey) => permKey === "users.view",
    });

    const list = await service.listSessions({ targetUserId });
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, "sess-bob-1");
  });

  // 4. Single Session Revoke & Protection
  await t.test("11 & 22 & 24: Own non-current session revoke allowed, transactional audit logged", async () => {
    const actorId = "user-alice";
    const currentSessionId = "sess-alice-current";
    const targetSessionId = "sess-alice-other";

    const sCurrent: SessionRecord = {
      id: currentSessionId,
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const sOther: SessionRecord = {
      id: targetSessionId,
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };

    const mock = createMockStore([sCurrent, sOther]);
    const auditCaptured: any[] = [];

    const service = new SessionService({
      store: mock.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: currentSessionId, userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      logAuditFn: async (args) => {
        assert.ok(args.tx, "Audit log MUST receive transaction client");
        auditCaptured.push(args);
      },
    });

    const res = await service.revokeSessionById(targetSessionId);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.sessionId, targetSessionId);
    assert.strictEqual(res.revokedCount, 1);

    // Verify session revoked in store
    assert.ok(sOther.revokedAt !== null, "Target session must be marked revoked");
    assert.strictEqual(sCurrent.revokedAt, null, "Current session must remain active");

    // Verify audit log
    assert.strictEqual(auditCaptured.length, 1);
    assert.strictEqual(auditCaptured[0].action, "AUTH_SESSION_REVOKED");
    assert.strictEqual(auditCaptured[0].actorId, actorId);
    assert.strictEqual(auditCaptured[0].resourceType, "Session");
    assert.strictEqual(auditCaptured[0].resourceId, targetSessionId);
    assert.strictEqual(auditCaptured[0].metadata.targetUserId, actorId);
    assert.strictEqual(auditCaptured[0].metadata.revokeMode, "SINGLE");
    assert.strictEqual(auditCaptured[0].metadata.revokedCount, 1);
  });

  await t.test("12. Own current session revoke denied with CURRENT_SESSION_PROTECTED", async () => {
    const actorId = "user-alice";
    const currentSessionId = "sess-alice-current";

    const sCurrent: SessionRecord = {
      id: currentSessionId,
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };

    const mock = createMockStore([sCurrent]);
    const service = new SessionService({
      store: mock.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: currentSessionId, userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
    });

    await assert.rejects(
      async () => await service.revokeSessionById(currentSessionId),
      (err: any) =>
        err instanceof SessionServiceError &&
        err.code === "CURRENT_SESSION_PROTECTED" &&
        err.status === 400
    );
    assert.strictEqual(sCurrent.revokedAt, null, "Current session must remain unrevoked");
  });

  await t.test("13 & 14 & 15: Foreign session revoke requires exact users.manage; system.manage alone DENIED", async () => {
    const actorId = "user-alice";
    const targetUserId = "user-bob";
    const bobSessionId = "sess-bob";

    const sBob: SessionRecord = {
      id: bobSessionId,
      userId: targetUserId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };

    // 15. system.manage alone => DENIED
    const mock1 = createMockStore([sBob]);
    const serviceSysManage = new SessionService({
      store: mock1.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-alice", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async (_u, perm) => perm === "system.manage",
    });

    await assert.rejects(
      async () => await serviceSysManage.revokeSessionById(bobSessionId),
      (err: any) => err instanceof SessionServiceError && err.code === "FORBIDDEN" && err.status === 403
    );

    // 13. users.view alone => DENIED
    const mock2 = createMockStore([sBob]);
    const serviceViewOnly = new SessionService({
      store: mock2.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-alice", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async (_u, perm) => perm === "users.view",
    });

    await assert.rejects(
      async () => await serviceViewOnly.revokeSessionById(bobSessionId),
      (err: any) => err instanceof SessionServiceError && err.code === "FORBIDDEN" && err.status === 403
    );

    // 14. users.manage exact => ALLOWED
    const mock3 = createMockStore([sBob]);
    const serviceUsersManage = new SessionService({
      store: mock3.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-alice", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      hasPermissionFn: async (_u, perm) => perm === "users.manage",
    });

    const res = await serviceUsersManage.revokeSessionById(bobSessionId);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.sessionId, bobSessionId);
    assert.ok(sBob.revokedAt !== null, "Foreign session must be marked revoked");
  });

  // 5. Revoke Other Sessions
  await t.test("20 & 21: revokeOtherSessions preserves current session and records actual affected count in audit", async () => {
    const actorId = "user-alice";
    const currentSessionId = "sess-1";

    const s1: SessionRecord = {
      id: "sess-1",
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const s2: SessionRecord = {
      id: "sess-2",
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const s3: SessionRecord = {
      id: "sess-3",
      userId: actorId,
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };
    const sBob: SessionRecord = {
      id: "sess-bob",
      userId: "user-bob",
      createdAt: new Date(fixedNow),
      expiresAt: new Date(fixedNow.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
      revokedAt: null,
    };

    const mock = createMockStore([s1, s2, s3, sBob]);
    const auditCaptured: any[] = [];

    const service = new SessionService({
      store: mock.store,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: currentSessionId, userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
      logAuditFn: async (args) => {
        auditCaptured.push(args);
      },
    });

    const res = await service.revokeOtherSessions();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.revokedCount, 2);

    assert.strictEqual(s1.revokedAt, null, "Current session s1 must remain active");
    assert.ok(s2.revokedAt !== null, "s2 must be revoked");
    assert.ok(s3.revokedAt !== null, "s3 must be revoked");
    assert.strictEqual(sBob.revokedAt, null, "Bob's session must not be affected");

    assert.strictEqual(auditCaptured.length, 1);
    assert.strictEqual(auditCaptured[0].metadata.revokedCount, 2);
    assert.strictEqual(auditCaptured[0].metadata.revokeMode, "OTHERS");
    assert.strictEqual(auditCaptured[0].metadata.targetUserId, actorId);
  });

  // 6. DB Fail-Closed and Error handling
  await t.test("23. DB failure returns controlled DATABASE_ERROR, not empty success", async () => {
    const actorId = "user-alice";
    const failingStore: SessionStore = {
      async findMany() {
        throw new Error("Connection lost");
      },
      async findUnique() {
        throw new Error("Connection lost");
      },
      async updateMany() {
        throw new Error("Connection lost");
      },
      async $transaction() {
        throw new Error("Connection lost");
      },
    };

    const service = new SessionService({
      store: failingStore,
      nowFn,
      getCurrentActorFn: async () => ({
        session: { id: "sess-1", userId: actorId },
        user: { id: actorId, status: "ACTIVE" },
      }),
    });

    await assert.rejects(
      async () => await service.listSessions(),
      (err: any) => err instanceof SessionServiceError && err.code === "DATABASE_ERROR" && err.status === 500
    );

    await assert.rejects(
      async () => await service.revokeSessionById("sess-any"),
      (err: any) => err instanceof SessionServiceError && err.code === "DATABASE_ERROR" && err.status === 500
    );

    await assert.rejects(
      async () => await service.revokeOtherSessions(),
      (err: any) => err instanceof SessionServiceError && err.code === "DATABASE_ERROR" && err.status === 500
    );
  });
});
