-- CreateEnum
CREATE TYPE "RedirectType" AS ENUM ('MOVED_PERMANENTLY', 'FOUND');

-- CreateTable
CREATE TABLE "ProjectSeoSettings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "defaultTitle" TEXT,
    "titleTemplate" TEXT,
    "defaultDescription" TEXT,
    "defaultOgImage" TEXT,
    "robotsTxt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSeoSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "type" "RedirectType" NOT NULL DEFAULT 'MOVED_PERMANENTLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSeoSettings_projectId_key" ON "ProjectSeoSettings"("projectId");

-- CreateIndex
CREATE INDEX "ProjectSeoSettings_projectId_idx" ON "ProjectSeoSettings"("projectId");

-- CreateIndex
CREATE INDEX "RedirectRule_projectId_active_idx" ON "RedirectRule"("projectId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "RedirectRule_projectId_sourcePath_key" ON "RedirectRule"("projectId", "sourcePath");

-- AddForeignKey
ALTER TABLE "ProjectSeoSettings" ADD CONSTRAINT "ProjectSeoSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectRule" ADD CONSTRAINT "RedirectRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectRule" ADD CONSTRAINT "RedirectRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
