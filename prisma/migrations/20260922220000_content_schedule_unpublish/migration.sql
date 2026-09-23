ALTER TABLE "Page"
ADD COLUMN "scheduledRevisionId" TEXT,
ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
ADD COLUMN "scheduledById" TEXT;

CREATE INDEX "Page_scheduledRevisionId_idx"
ON "Page"("scheduledRevisionId");

CREATE INDEX "Page_scheduledById_idx"
ON "Page"("scheduledById");

CREATE INDEX "Page_projectId_scheduledPublishAt_idx"
ON "Page"("projectId", "scheduledPublishAt");

ALTER TABLE "Page"
ADD CONSTRAINT "Page_scheduledRevisionId_fkey"
FOREIGN KEY ("scheduledRevisionId")
REFERENCES "PageRevision"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Page"
ADD CONSTRAINT "Page_scheduledById_fkey"
FOREIGN KEY ("scheduledById")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
