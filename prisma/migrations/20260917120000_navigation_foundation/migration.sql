-- CreateEnum
CREATE TYPE "NavigationContext" AS ENUM ('HEADER', 'FOOTER', 'MOBILE', 'PORTAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "NavigationItemType" AS ENUM ('PAGE', 'EXTERNAL_LINK', 'ANCHOR', 'GROUP');

-- CreateEnum
CREATE TYPE "NavigationSetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "NavigationSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "context" "NavigationContext" NOT NULL,
    "status" "NavigationSetStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavigationSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NavigationItem" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "NavigationItemType" NOT NULL,
    "label" TEXT NOT NULL,
    "pageId" TEXT,
    "externalUrl" TEXT,
    "anchor" TEXT,
    "icon" TEXT,
    "visibility" BOOLEAN NOT NULL DEFAULT true,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavigationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NavigationSet_projectId_idx" ON "NavigationSet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "NavigationSet_projectId_key_key" ON "NavigationSet"("projectId", "key");

-- CreateIndex
CREATE INDEX "NavigationItem_setId_idx" ON "NavigationItem"("setId");

-- CreateIndex
CREATE INDEX "NavigationItem_parentId_idx" ON "NavigationItem"("parentId");

-- CreateIndex
CREATE INDEX "NavigationItem_pageId_idx" ON "NavigationItem"("pageId");

-- AddForeignKey
ALTER TABLE "NavigationSet" ADD CONSTRAINT "NavigationSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "NavigationSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NavigationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
