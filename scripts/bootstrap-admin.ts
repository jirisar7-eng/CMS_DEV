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
    'content.approve', 'content.publish', 'content.rollback', 'content.archive',
    'navigation.view', 'navigation.create', 'navigation.edit', 'navigation.delete', 'navigation.publish',
    'seo.read', 'seo.update', 'seo.manage_defaults',
    'redirects.read', 'redirects.create', 'redirects.update', 'redirects.delete',
    'search.read_admin', 'search.manage', 'search.reindex',
    'system_map.read_basic',
    'plugin.read', 'plugin.manage'
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

  // 2b. Ensure system_map.read_internal exists, but is NOT granted to SUPER_ADMIN role (remove if present)
  let internalPerm = await prisma.permission.findUnique({
    where: { key: 'system_map.read_internal' },
  });
  if (!internalPerm) {
    console.log('Creating sensitive permission: system_map.read_internal');
    internalPerm = await prisma.permission.create({
      data: {
        key: 'system_map.read_internal',
        description: 'Sensitive permission: full authoritative lineage and capability map access',
      },
    });
  }

  // Idempotently ensure system_map.read_internal is NOT attached to SUPER_ADMIN role
  const existingRolePerm = await prisma.rolePermission.findUnique({
    where: {
      roleId_permissionId: {
        roleId: superAdminRole.id,
        permissionId: internalPerm.id,
      },
    },
  });
  if (existingRolePerm) {
    console.log('Removing system_map.read_internal from SUPER_ADMIN role (must not be role-granted)...');
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: superAdminRole.id,
          permissionId: internalPerm.id,
        },
      },
    });
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

  // 4b. Grant bootstrap owner explicit individual global ALLOW override for system_map.read_internal
  const internalOverride = await prisma.userPermissionOverride.findFirst({
    where: {
      userId: adminUser.id,
      permissionId: internalPerm.id,
      projectId: null,
    },
  });

  if (!internalOverride) {
    console.log(`Granting explicit individual global ALLOW override for system_map.read_internal to bootstrap owner (${email})`);
    await prisma.userPermissionOverride.create({
      data: {
        userId: adminUser.id,
        permissionId: internalPerm.id,
        projectId: null,
        isGranted: true,
      },
    });
  } else if (!internalOverride.isGranted) {
    console.log(`Switching existing DENY override to ALLOW for bootstrap owner (${email}) on system_map.read_internal`);
    await prisma.userPermissionOverride.update({
      where: { id: internalOverride.id },
      data: {
        isGranted: true,
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
