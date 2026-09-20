-- CreateTable
CREATE TABLE "ProjectPluginState" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "enabledAt" TIMESTAMP(3),
    "enabledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPluginState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPluginState_projectId_enabled_idx" ON "ProjectPluginState"("projectId", "enabled");

-- CreateIndex
CREATE INDEX "ProjectPluginState_pluginId_idx" ON "ProjectPluginState"("pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPluginState_projectId_pluginId_key" ON "ProjectPluginState"("projectId", "pluginId");

-- AddForeignKey
ALTER TABLE "ProjectPluginState" ADD CONSTRAINT "ProjectPluginState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPluginState" ADD CONSTRAINT "ProjectPluginState_enabledById_fkey" FOREIGN KEY ("enabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
