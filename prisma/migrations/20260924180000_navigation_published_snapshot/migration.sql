-- AlterTable
ALTER TABLE "NavigationSet" ADD COLUMN "publishedSnapshot" JSONB,
ADD COLUMN "publishedVersion" INTEGER,
ADD COLUMN "publishedAt" TIMESTAMP(3);
