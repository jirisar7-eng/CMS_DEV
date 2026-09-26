import type { Prisma, PrismaClient } from "@prisma/client";
import { logAudit } from "@/lib/auth/audit";
import { ProjectDomainError, ProjectResult } from "./types";

export interface ProjectServiceDependencies {
  prisma?: PrismaClient;
}

export class ProjectService {
  private customDb?: PrismaClient;

  constructor(deps?: ProjectServiceDependencies) {
    this.customDb = deps?.prisma;
  }

  private async getDb(): Promise<PrismaClient> {
    if (this.customDb) return this.customDb;
    const { prisma } = await import("@/lib/db");
    return prisma as PrismaClient;
  }

  async createProject(
    input: { name: string; key: string },
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ): Promise<ProjectResult> {
    const db = await this.getDb();
    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Pre-check for duplicate key
      const existing = await tx.project.findUnique({
        where: { key: input.key },
      });
      if (existing) {
        throw new ProjectDomainError(
          "KEY_COLLISION",
          `A project with key "${input.key}" already exists`,
          409
        );
      }

      // 2. Create project
      const project = await tx.project.create({
        data: {
          name: input.name,
          key: input.key,
          status: "ACTIVE",
        },
      });

      // 3. Atomically write audit event
      await logAudit({
        action: "PROJECT_CREATED",
        scopeType: "SYSTEM",
        scopeId: null,
        resourceType: "PROJECT",
        resourceId: project.id,
        metadata: {
          name: project.name,
          key: project.key,
          status: project.status,
        },
        actorId,
        tx,
      });

      return project as ProjectResult;
    };

    try {
      if (externalTx) {
        return await execute(externalTx);
      }
      return await db.$transaction(execute);
    } catch (err: unknown) {
      if (err instanceof ProjectDomainError) {
        throw err;
      }
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
        throw new ProjectDomainError(
          "KEY_COLLISION",
          `A project with key "${input.key}" already exists`,
          409
        );
      }
      console.error("[ProjectService.createProject] Unexpected error:", err);
      throw new ProjectDomainError("INTERNAL_ERROR", "Failed to create project", 500);
    }
  }

  async renameProject(
    projectId: string,
    newName: string,
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ): Promise<ProjectResult> {
    const db = await this.getDb();
    const execute = async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        throw new ProjectDomainError("PROJECT_NOT_FOUND", "Project not found", 404);
      }
      if (project.status !== "ACTIVE") {
        throw new ProjectDomainError(
          "INVALID_LIFECYCLE_STATE",
          "Only ACTIVE projects can be renamed",
          409
        );
      }

      const updated = await tx.project.update({
        where: { id: projectId },
        data: { name: newName },
      });

      await logAudit({
        action: "PROJECT_UPDATED",
        scopeType: "PROJECT",
        scopeId: projectId,
        resourceType: "PROJECT",
        resourceId: projectId,
        metadata: {
          previousName: project.name,
          name: newName,
        },
        actorId,
        tx,
      });

      return updated as ProjectResult;
    };

    try {
      if (externalTx) {
        return await execute(externalTx);
      }
      return await db.$transaction(execute);
    } catch (err: unknown) {
      if (err instanceof ProjectDomainError) {
        throw err;
      }
      console.error("[ProjectService.renameProject] Unexpected error:", err);
      throw new ProjectDomainError("INTERNAL_ERROR", "Failed to rename project", 500);
    }
  }

  async archiveProject(
    projectId: string,
    actorId: string,
    externalTx?: Prisma.TransactionClient
  ): Promise<ProjectResult> {
    const db = await this.getDb();
    const execute = async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        throw new ProjectDomainError("PROJECT_NOT_FOUND", "Project not found", 404);
      }
      if (project.status === "ARCHIVED") {
        throw new ProjectDomainError(
          "INVALID_LIFECYCLE_STATE",
          "Project is already archived",
          409
        );
      }
      if (project.status !== "ACTIVE") {
        throw new ProjectDomainError(
          "INVALID_LIFECYCLE_STATE",
          "Only ACTIVE projects can be archived",
          409
        );
      }

      const updated = await tx.project.update({
        where: { id: projectId },
        data: { status: "ARCHIVED" },
      });

      await logAudit({
        action: "PROJECT_ARCHIVED",
        scopeType: "PROJECT",
        scopeId: projectId,
        resourceType: "PROJECT",
        resourceId: projectId,
        metadata: {
          previousStatus: project.status,
          status: "ARCHIVED",
          name: project.name,
          key: project.key,
        },
        actorId,
        tx,
      });

      return updated as ProjectResult;
    };

    try {
      if (externalTx) {
        return await execute(externalTx);
      }
      return await db.$transaction(execute);
    } catch (err: unknown) {
      if (err instanceof ProjectDomainError) {
        throw err;
      }
      console.error("[ProjectService.archiveProject] Unexpected error:", err);
      throw new ProjectDomainError("INTERNAL_ERROR", "Failed to archive project", 500);
    }
  }
}

let projectServiceInstance: ProjectService | null = null;

export function getProjectService(): ProjectService {
  if (!projectServiceInstance) {
    projectServiceInstance = new ProjectService();
  }
  return projectServiceInstance;
}

export function setProjectServiceForTesting(service: ProjectService | null): void {
  projectServiceInstance = service;
}
