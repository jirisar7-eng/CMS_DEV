-- CreateEnum
CREATE TYPE "PageRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PageVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PASSWORD_PROTECTED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ContentReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "draftRevisionId" TEXT,
    "publishedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "PageRevisionStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "PageVisibility" NOT NULL,
    "content" JSONB NOT NULL,
    "seo" JSONB NOT NULL,
    "navigation" JSONB NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "lockVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "derivedFromRevisionId" TEXT,

    CONSTRAINT "PageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRelease" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ContentReleaseStatus" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "ContentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReleaseItem" (
    "releaseId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "previousRevisionId" TEXT,

    CONSTRAINT "ContentReleaseItem_pkey" PRIMARY KEY ("releaseId","pageId")
);

-- CreateIndex
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");

-- CreateIndex
CREATE INDEX "Page_parentId_idx" ON "Page"("parentId");

-- CreateIndex
CREATE INDEX "Page_projectId_parentId_sortOrder_idx" ON "Page"("projectId", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Page_projectId_key_key" ON "Page"("projectId", "key");

-- CreateIndex
CREATE INDEX "PageRevision_pageId_idx" ON "PageRevision"("pageId");

-- CreateIndex
CREATE INDEX "PageRevision_status_idx" ON "PageRevision"("status");

-- CreateIndex
CREATE INDEX "PageRevision_createdAt_idx" ON "PageRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageRevision_pageId_revisionNumber_key" ON "PageRevision"("pageId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ContentRelease_projectId_idx" ON "ContentRelease"("projectId");

-- CreateIndex
CREATE INDEX "ContentRelease_status_idx" ON "ContentRelease"("status");

-- CreateIndex
CREATE INDEX "ContentRelease_createdAt_idx" ON "ContentRelease"("createdAt");

-- CreateIndex
CREATE INDEX "ContentReleaseItem_pageId_idx" ON "ContentReleaseItem"("pageId");

-- CreateIndex
CREATE INDEX "ContentReleaseItem_revisionId_idx" ON "ContentReleaseItem"("revisionId");

-- CreateIndex
CREATE INDEX "ContentReleaseItem_previousRevisionId_idx" ON "ContentReleaseItem"("previousRevisionId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "PageRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "PageRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageRevision" ADD CONSTRAINT "PageRevision_derivedFromRevisionId_fkey" FOREIGN KEY ("derivedFromRevisionId") REFERENCES "PageRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRelease" ADD CONSTRAINT "ContentRelease_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReleaseItem" ADD CONSTRAINT "ContentReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "ContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReleaseItem" ADD CONSTRAINT "ContentReleaseItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReleaseItem" ADD CONSTRAINT "ContentReleaseItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReleaseItem" ADD CONSTRAINT "ContentReleaseItem_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES "PageRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

