import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const ADMIN_EMAIL = "smoke-admin@synthesis.local";
export const ADMIN_PASSWORD = "SmokeAdminPassword123!";
export const READER_EMAIL = "smoke-reader@synthesis.local";
export const READER_PASSWORD = "SmokeReaderPassword123!";
export const DISABLED_EMAIL = "smoke-disabled@synthesis.local";
export const DISABLED_PASSWORD = "SmokeDisabledPassword123!";

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    // 1. Ensure SUPER_ADMIN role exists
    let adminRole = await prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } });
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          name: "SUPER_ADMIN",
          description: "Super Admin for Smoke Tests",
          isSystem: true,
        },
      });
    }

    // 2. Ensure permissions
    const permissions = [
      "admin.access",
      "projects.view",
      "projects.manage",
      "content.view",
      "content.create",
      "content.edit",
      "content.review",
      "content.approve",
      "content.publish",
    ];

    for (const key of permissions) {
      let perm = await prisma.permission.findUnique({ where: { key } });
      if (!perm) {
        perm = await prisma.permission.create({
          data: { key, description: `Permission ${key}` },
        });
      }
      const rolePerm = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: perm.id,
          },
        },
      });
      if (!rolePerm) {
        await prisma.rolePermission.create({
          data: {
            roleId: adminRole.id,
            permissionId: perm.id,
          },
        });
      }
    }

    // 3. Admin user
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    let adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          displayName: "Smoke Admin",
          passwordHash: adminHash,
          status: "ACTIVE",
        },
      });
    } else {
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { passwordHash: adminHash, status: "ACTIVE" },
      });
    }

    const adminUserRole = await prisma.userRole.findFirst({
      where: { userId: adminUser.id, roleId: adminRole.id },
    });
    if (!adminUserRole) {
      await prisma.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          projectId: null,
        },
      });
    }

    // 4. Reader user (no admin roles)
    const readerHash = await bcrypt.hash(READER_PASSWORD, 10);
    let readerUser = await prisma.user.findUnique({ where: { email: READER_EMAIL } });
    if (!readerUser) {
      readerUser = await prisma.user.create({
        data: {
          email: READER_EMAIL,
          displayName: "Smoke Reader",
          passwordHash: readerHash,
          status: "ACTIVE",
        },
      });
    } else {
      await prisma.user.update({
        where: { id: readerUser.id },
        data: { passwordHash: readerHash, status: "ACTIVE" },
      });
    }

    // 5. Disabled user
    const disabledHash = await bcrypt.hash(DISABLED_PASSWORD, 10);
    let disabledUser = await prisma.user.findUnique({ where: { email: DISABLED_EMAIL } });
    if (!disabledUser) {
      disabledUser = await prisma.user.create({
        data: {
          email: DISABLED_EMAIL,
          displayName: "Smoke Disabled User",
          passwordHash: disabledHash,
          status: "SUSPENDED",
        },
      });
    } else {
      await prisma.user.update({
        where: { id: disabledUser.id },
        data: { passwordHash: disabledHash, status: "SUSPENDED" },
      });
    }

    // 6. Projects Alpha and Beta
    await prisma.project.upsert({
      where: { key: "alpha-smoke" },
      update: { name: "Project Alpha Smoke", status: "ACTIVE" },
      create: {
        key: "alpha-smoke",
        name: "Project Alpha Smoke",
        status: "ACTIVE",
      },
    });

    await prisma.project.upsert({
      where: { key: "beta-smoke" },
      update: { name: "Project Beta Smoke", status: "ACTIVE" },
      create: {
        key: "beta-smoke",
        name: "Project Beta Smoke",
        status: "ACTIVE",
      },
    });

    console.log("Global setup completed: Users, Roles, and Projects seeded successfully.");
  } finally {
    await prisma.$disconnect();
  }
}
