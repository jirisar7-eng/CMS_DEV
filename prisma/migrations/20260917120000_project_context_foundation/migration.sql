-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- Data Migration: Ensure any existing projectIds have a corresponding Project record
-- We will insert a stub project for any distinct projectId found in existing tables.
INSERT INTO "Project" ("id", "key", "name", "updatedAt")
SELECT DISTINCT "projectId", "projectId", 'Migrated Project ' || "projectId", CURRENT_TIMESTAMP
FROM (
    SELECT "projectId" FROM "UserRole" WHERE "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM "UserPermissionOverride" WHERE "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM "MediaAsset" WHERE "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM "Brand" WHERE "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM "Page" WHERE "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM "ContentRelease" WHERE "projectId" IS NOT NULL
) AS ExistingProjects
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRelease" ADD CONSTRAINT "ContentRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
