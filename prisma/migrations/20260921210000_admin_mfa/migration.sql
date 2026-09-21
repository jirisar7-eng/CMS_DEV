-- CreateTable
CREATE TABLE "UserMfa" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totpSecretEncrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "mfaId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMfa_userId_key" ON "UserMfa"("userId");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_mfaId_idx" ON "MfaRecoveryCode"("mfaId");

-- AddForeignKey
ALTER TABLE "UserMfa" ADD CONSTRAINT "UserMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_mfaId_fkey" FOREIGN KEY ("mfaId") REFERENCES "UserMfa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

