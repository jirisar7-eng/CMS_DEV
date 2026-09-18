-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "locale" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "indexVersion" INTEGER NOT NULL DEFAULT 1,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchDocument_projectId_locale_idx" ON "SearchDocument"("projectId", "locale");

-- CreateIndex
CREATE INDEX "SearchDocument_revisionId_idx" ON "SearchDocument"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_projectId_pageId_key" ON "SearchDocument"("projectId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_projectId_path_key" ON "SearchDocument"("projectId", "path");

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PageRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

