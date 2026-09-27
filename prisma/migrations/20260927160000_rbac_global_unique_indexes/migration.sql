-- Migration: 20260927160000_rbac_global_unique_indexes
-- Preflight: Fail closed if duplicate global UserRole or UserPermissionOverride records exist.
-- Enforce partial unique indexes for global records (WHERE "projectId" IS NULL).

DO $$
BEGIN
  -- 1. Preflight: Check for duplicate global UserRole assignments
  IF EXISTS (
    SELECT 1
    FROM "UserRole"
    WHERE "projectId" IS NULL
    GROUP BY "userId", "roleId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: Duplicate global UserRole records found where projectId IS NULL';
  END IF;

  -- 2. Preflight: Check for duplicate global UserPermissionOverride assignments
  IF EXISTS (
    SELECT 1
    FROM "UserPermissionOverride"
    WHERE "projectId" IS NULL
    GROUP BY "userId", "permissionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: Duplicate global UserPermissionOverride records found where projectId IS NULL';
  END IF;

  -- 3. Preflight: Check for conflicting global UserPermissionOverride (both ALLOW and DENY)
  IF EXISTS (
    SELECT 1
    FROM "UserPermissionOverride"
    WHERE "projectId" IS NULL
    GROUP BY "userId", "permissionId"
    HAVING COUNT(DISTINCT "isGranted") > 1
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAILED: Conflicting global UserPermissionOverride records found where projectId IS NULL';
  END IF;
END $$;

-- Create partial unique index for global UserRole records
CREATE UNIQUE INDEX "UserRole_userId_roleId_global_key"
ON "UserRole" ("userId", "roleId")
WHERE "projectId" IS NULL;

-- Create partial unique index for global UserPermissionOverride records
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permissionId_global_key"
ON "UserPermissionOverride" ("userId", "permissionId")
WHERE "projectId" IS NULL;
