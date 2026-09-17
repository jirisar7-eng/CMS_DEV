import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function bootstrap() {
  console.log('Starting Synthesis CMS bootstrap...');

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ERROR: Missing BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }

  // 1. Ensure SUPER_ADMIN role exists
  let superAdminRole = await prisma.role.findUnique({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!superAdminRole) {
    console.log('Creating SUPER_ADMIN role...');
    superAdminRole = await prisma.role.create({
      data: {
        name: 'SUPER_ADMIN',
        description: 'System-level Super Administrator',
        isSystem: true,
      },
    });
  }

  // 2. Ensure initial permissions exist
  const initialPermissions = [
    'admin.access',
    'brand.view', 'brand.edit', 'brand.publish', 'brand.rollback',
    'media.view', 'media.create', 'media.edit', 'media.delete',
    'users.view', 'users.manage',
    'roles.view', 'roles.manage',
    'audit.view',
    'system.manage', 'projects.view', 'projects.manage',
    'content.view', 'content.create', 'content.edit', 'content.review',
    'content.approve', 'content.publish', 'content.rollback', 'content.archive'
  ];

  for (const permKey of initialPermissions) {
    let perm = await prisma.permission.findUnique({
      where: { key: permKey },
    });
    if (!perm) {
      console.log(`Creating permission: ${permKey}`);
      perm = await prisma.permission.create({
        data: {
          key: permKey,
          description: `Core permission: ${permKey}`,
        },
      });
    }

    // Attach to SUPER_ADMIN if not already
    const rolePerm = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      },
    });

    if (!rolePerm) {
      await prisma.rolePermission.create({
        data: {
          roleId: superAdminRole.id,
          permissionId: perm.id,
        },
      });
    }
  }

  // 3. Create or update the admin user
  let adminUser = await prisma.user.findUnique({
    where: { email },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  if (!adminUser) {
    console.log(`Creating admin user: ${email}`);
    adminUser = await prisma.user.create({
      data: {
        email,
        displayName: 'System Admin',
        passwordHash,
        status: 'ACTIVE',
      },
    });
  } else {
    console.log(`Updating existing admin user: ${email}`);
    adminUser = await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        passwordHash,
        status: 'ACTIVE', // ensure active
      },
    });
  }

  // 4. Assign SUPER_ADMIN role
  const userRole = await prisma.userRole.findFirst({
    where: {
      userId: adminUser.id,
      roleId: superAdminRole.id,
    },
  });

  if (!userRole) {
    console.log(`Assigning SUPER_ADMIN role to ${email}`);
    await prisma.userRole.create({
      data: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
        projectId: null, // Global scope
      },
    });
  }

  // 5. Audit the bootstrap event
  await prisma.auditLog.create({
    data: {
      action: 'SYSTEM_BOOTSTRAP',
      scopeType: 'SYSTEM',
      actorId: adminUser.id,
      metadata: { 
        email, 
        message: 'Bootstrap script executed.' 
      },
    },
  });

  console.log('Bootstrap completed successfully.');
}

bootstrap()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
