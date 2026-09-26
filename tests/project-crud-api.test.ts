// @ts-nocheck
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Validation imports
import {
  validateProjectName,
  slugifyProjectName,
  validateProjectKey,
  validateCreateProjectInput,
  validatePatchProjectInput,
  validateProjectId,
} from "../lib/domain/projects/validation";
import { ProjectDomainError } from "../lib/domain/projects/types";
import { ProjectService, setProjectServiceForTesting } from "../lib/domain/projects/service";

// Mock classes for Next.js Request/Response
class MockNextResponse {
  status: number;
  headers: Map<string, string>;
  private _body: any;
  constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    this._body = body;
    this.status = init?.status ?? 200;
    this.headers = new Map(Object.entries(init?.headers || {}));
  }
  static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
    return new MockNextResponse(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  }
  async json() {
    return typeof this._body === "string" ? JSON.parse(this._body) : this._body;
  }
  async text() {
    return typeof this._body === "string" ? this._body : JSON.stringify(this._body);
  }
}

describe("SYN-PROJECTS-002: Project Domain Validation & Slugification", () => {
  it("validates project name bounds and rejects whitespace-only or control characters", () => {
    assert.strictEqual(validateProjectName("  Projekt Alfa  "), "Projekt Alfa");
    assert.throws(() => validateProjectName(""), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectName("   "), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectName("a".repeat(101)), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectName("Bad\x00Name"), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectName(123), (err) => err.code === "INVALID_INPUT");
  });

  it("deterministically derives canonical slug from Czech text", () => {
    assert.strictEqual(slugifyProjectName("Táta má právo"), "tata-ma-pravo");
    assert.strictEqual(slugifyProjectName("Příliš žluťoučký kůň"), "prilis-zlutoucky-kun");
    assert.strictEqual(slugifyProjectName("  Web & Portál 2026!  "), "web-portal-2026");
  });

  it("validates explicit project key slug requirements", () => {
    assert.strictEqual(validateProjectKey("alpha-smoke"), "alpha-smoke");
    assert.strictEqual(validateProjectKey("project123"), "project123");
    assert.throws(() => validateProjectKey("a"), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectKey("a".repeat(65)), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectKey("Project_Alfa"), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectKey("-project-"), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectKey("project--key"), (err) => err.code === "INVALID_INPUT");
  });

  it("derives fallback key when key is omitted", () => {
    assert.strictEqual(validateProjectKey(undefined, "Nový CMS Projekt"), "novy-cms-projekt");
    assert.strictEqual(validateProjectKey("", "Táta má právo"), "tata-ma-pravo");
    assert.throws(() => validateProjectKey(undefined, "@#$"), (err) => err.code === "INVALID_INPUT");
  });

  it("strictly validates create request shape and rejects mass-assignment / unknown properties", () => {
    const valid = validateCreateProjectInput({ name: "Projekt Beta" });
    assert.strictEqual(valid.name, "Projekt Beta");
    assert.strictEqual(valid.key, "projekt-beta");

    const validWithKey = validateCreateProjectInput({ name: "Projekt Gamma", key: "custom-gamma" });
    assert.strictEqual(validWithKey.key, "custom-gamma");

    assert.throws(
      () => validateCreateProjectInput({ name: "P", key: "p-key", status: "ARCHIVED" }),
      (err) => err.code === "INVALID_INPUT"
    );
    assert.throws(
      () => validateCreateProjectInput({ name: "P", role: "ADMIN" }),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("strictly validates patch request shape and enforces key immutability", () => {
    const rename = validatePatchProjectInput({ name: "Přejmenovaný projekt" });
    assert.deepStrictEqual(rename, { type: "RENAME", name: "Přejmenovaný projekt" });

    const archive = validatePatchProjectInput({ status: "ARCHIVED" });
    assert.deepStrictEqual(archive, { type: "ARCHIVE", status: "ARCHIVED" });

    // Key immutability: key must be rejected in PATCH
    assert.throws(
      () => validatePatchProjectInput({ key: "new-key" }),
      (err) => err.code === "INVALID_INPUT" && err.message.includes("immutable")
    );

    // Mixed operations rejected
    assert.throws(
      () => validatePatchProjectInput({ name: "New Name", status: "ARCHIVED" }),
      (err) => err.code === "INVALID_INPUT"
    );

    // Unsupported status transition rejected
    assert.throws(
      () => validatePatchProjectInput({ status: "DISABLED" }),
      (err) => err.code === "INVALID_INPUT"
    );
    assert.throws(
      () => validatePatchProjectInput({ status: "ACTIVE" }),
      (err) => err.code === "INVALID_INPUT"
    );
  });

  it("validates project ID normalization and character bounds", () => {
    assert.strictEqual(validateProjectId("proj-1234"), "proj-1234");
    assert.throws(() => validateProjectId(""), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectId("   "), (err) => err.code === "INVALID_INPUT");
    assert.throws(() => validateProjectId("proj<bad>"), (err) => err.code === "INVALID_INPUT");
  });
});

describe("SYN-PROJECTS-002: Project Service Lifecycle & Domain Invariants", () => {
  let mockProjects: Map<string, any>;
  let mockAuditLogs: any[];
  let service: ProjectService;

  beforeEach(() => {
    mockProjects = new Map();
    mockAuditLogs = [];

    const mockPrisma = {
      project: {
        findUnique: async ({ where }: any) => {
          if (where.id) return mockProjects.get(where.id) || null;
          if (where.key) {
            for (const p of mockProjects.values()) {
              if (p.key === where.key) return p;
            }
          }
          return null;
        },
        create: async ({ data }: any) => {
          const project = {
            id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: data.name,
            key: data.key,
            status: data.status || "ACTIVE",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockProjects.set(project.id, project);
          return project;
        },
        update: async ({ where, data }: any) => {
          const existing = mockProjects.get(where.id);
          if (!existing) throw new Error("NOT_FOUND");
          const updated = { ...existing, ...data, updatedAt: new Date() };
          mockProjects.set(where.id, updated);
          return updated;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          mockAuditLogs.push(data);
          return data;
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    };

    service = new ProjectService({ prisma: mockPrisma as any });
  });

  it("creates an ACTIVE project with atomic PROJECT_CREATED audit log", async () => {
    const created = await service.createProject(
      { name: "Táta má právo", key: "tata-ma-pravo" },
      "user-admin"
    );
    assert.strictEqual(created.name, "Táta má právo");
    assert.strictEqual(created.key, "tata-ma-pravo");
    assert.strictEqual(created.status, "ACTIVE");

    assert.strictEqual(mockAuditLogs.length, 1);
    assert.strictEqual(mockAuditLogs[0].action, "PROJECT_CREATED");
    assert.strictEqual(mockAuditLogs[0].scopeType, "SYSTEM");
    assert.strictEqual(mockAuditLogs[0].resourceId, created.id);
    assert.strictEqual(mockAuditLogs[0].actorId, "user-admin");
    assert.strictEqual(mockAuditLogs[0].metadata?.key, "tata-ma-pravo");
  });

  it("prevents duplicate project keys (collision) with 409 KEY_COLLISION", async () => {
    await service.createProject({ name: "První projekt", key: "same-key" }, "user-admin");
    await assert.rejects(
      () => service.createProject({ name: "Druhý projekt", key: "same-key" }, "user-admin"),
      (err: any) => err.code === "KEY_COLLISION" && err.status === 409
    );
  });

  it("renames active project and logs PROJECT_UPDATED audit event", async () => {
    const created = await service.createProject({ name: "Původní název", key: "test-rename" }, "user-admin");
    const renamed = await service.renameProject(created.id, "Nový název", "user-admin");
    assert.strictEqual(renamed.name, "Nový název");
    assert.strictEqual(renamed.key, "test-rename");

    const audit = mockAuditLogs.find((l) => l.action === "PROJECT_UPDATED");
    assert.ok(audit, "Must log PROJECT_UPDATED");
    assert.strictEqual(audit.resourceId, created.id);
    assert.strictEqual(audit.metadata?.previousName, "Původní název");
    assert.strictEqual(audit.metadata?.name, "Nový název");
  });

  it("archives active project and logs PROJECT_ARCHIVED audit event", async () => {
    const created = await service.createProject({ name: "K archivaci", key: "to-archive" }, "user-admin");
    const archived = await service.archiveProject(created.id, "user-admin");
    assert.strictEqual(archived.status, "ARCHIVED");

    const audit = mockAuditLogs.find((l) => l.action === "PROJECT_ARCHIVED");
    assert.ok(audit, "Must log PROJECT_ARCHIVED");
    assert.strictEqual(audit.resourceId, created.id);
    assert.strictEqual(audit.metadata?.previousStatus, "ACTIVE");
    assert.strictEqual(audit.metadata?.status, "ARCHIVED");
  });

  it("rejects renaming or repeated archiving of an already ARCHIVED project", async () => {
    const created = await service.createProject({ name: "Archiv", key: "archived-proj" }, "user-admin");
    await service.archiveProject(created.id, "user-admin");

    await assert.rejects(
      () => service.renameProject(created.id, "Nemožné", "user-admin"),
      (err: any) => err.code === "INVALID_LIFECYCLE_STATE" && err.status === 409
    );

    await assert.rejects(
      () => service.archiveProject(created.id, "user-admin"),
      (err: any) => err.code === "INVALID_LIFECYCLE_STATE" && err.status === 409
    );
  });
});
