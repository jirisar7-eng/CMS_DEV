-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVersion" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "typography" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "themeModes" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "derivedFromVersionId" TEXT,

    CONSTRAINT "BrandVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_key_key" ON "Brand"("key");

-- CreateIndex
CREATE INDEX "Brand_scope_projectId_idx" ON "Brand"("scope", "projectId");

-- CreateIndex
CREATE INDEX "BrandVersion_brandId_idx" ON "BrandVersion"("brandId");

-- CreateIndex
CREATE INDEX "BrandVersion_status_idx" ON "BrandVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVersion_brandId_version_key" ON "BrandVersion"("brandId", "version");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "BrandVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVersion" ADD CONSTRAINT "BrandVersion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
