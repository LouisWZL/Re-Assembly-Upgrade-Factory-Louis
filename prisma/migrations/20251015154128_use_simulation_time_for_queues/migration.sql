-- CreateTable
CREATE TABLE "PreAcceptanceQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreAcceptanceQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PreInspectionQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreInspectionQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostInspectionQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostInspectionQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "factoryId" TEXT NOT NULL,
    "preAcceptanceReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "preInspectionReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "postInspectionReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueConfig_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PreAcceptanceQueue_orderId_key" ON "PreAcceptanceQueue"("orderId");

-- CreateIndex
CREATE INDEX "PreAcceptanceQueue_processingOrder_queuedAtSimMinute_idx" ON "PreAcceptanceQueue"("processingOrder", "queuedAtSimMinute");

-- CreateIndex
CREATE UNIQUE INDEX "PreInspectionQueue_orderId_key" ON "PreInspectionQueue"("orderId");

-- CreateIndex
CREATE INDEX "PreInspectionQueue_processingOrder_queuedAtSimMinute_idx" ON "PreInspectionQueue"("processingOrder", "queuedAtSimMinute");

-- CreateIndex
CREATE UNIQUE INDEX "PostInspectionQueue_orderId_key" ON "PostInspectionQueue"("orderId");

-- CreateIndex
CREATE INDEX "PostInspectionQueue_processingOrder_queuedAtSimMinute_idx" ON "PostInspectionQueue"("processingOrder", "queuedAtSimMinute");

-- CreateIndex
CREATE UNIQUE INDEX "QueueConfig_factoryId_key" ON "QueueConfig"("factoryId");
