/*
  Warnings:

  - You are about to drop the `_BaugruppeToProduktvariante` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `upgradeTyp` on the `Auftrag` table. All the data in the column will be lost.
  - You are about to drop the column `prozesszeit` on the `Baugruppe` table. All the data in the column will be lost.
  - You are about to drop the column `volumen` on the `Baugruppe` table. All the data in the column will be lost.
  - You are about to drop the column `beschreibung` on the `Baugruppentyp` table. All the data in the column will be lost.
  - You are about to drop the column `zustand` on the `Produktvariante` table. All the data in the column will be lost.
  - Added the required column `factoryId` to the `Baugruppe` table without a default value. This is not possible if the table is not empty.
  - Added the required column `factoryId` to the `Baugruppentyp` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "_BaugruppeToProduktvariante_B_index";

-- DropIndex
DROP INDEX "_BaugruppeToProduktvariante_AB_unique";

-- AlterTable
ALTER TABLE "Produkt" ADD COLUMN "graphData" JSONB;
ALTER TABLE "Produkt" ADD COLUMN "processGraphData" JSONB;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_BaugruppeToProduktvariante";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "BaugruppeInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baugruppeId" TEXT NOT NULL,
    "austauschBaugruppeId" TEXT,
    "auftragId" TEXT NOT NULL,
    "zustand" INTEGER NOT NULL,
    "reAssemblyTyp" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BaugruppeInstance_baugruppeId_fkey" FOREIGN KEY ("baugruppeId") REFERENCES "Baugruppe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BaugruppeInstance_austauschBaugruppeId_fkey" FOREIGN KEY ("austauschBaugruppeId") REFERENCES "Baugruppe" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BaugruppeInstance_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionStepTiming" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "simulationTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "simulationStartTime" DATETIME NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "durationMinutes" INTEGER,
    "stepType" TEXT NOT NULL DEFAULT 'assembly',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DemontageTimings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME,
    "durationMinutes" INTEGER,
    "simulationTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdvancedOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayId" TEXT,
    "customerName" TEXT NOT NULL,
    "productVariantName" TEXT NOT NULL,
    "productVariantType" TEXT NOT NULL,
    "currentPhase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deliveryDate" DATETIME NOT NULL,
    "totalProcessingTime" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "reassemblyReason" TEXT,
    "requiresReassembly" BOOLEAN NOT NULL DEFAULT false,
    "assignedLineNumber" INTEGER,
    "needsQualityRework" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdvancedProcessStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "durationMinutes" INTEGER,
    "wasRework" BOOLEAN NOT NULL DEFAULT false,
    "disruptionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "disruptionDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdvancedProcessStep_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdvancedOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdvancedComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "conditionPercentage" INTEGER NOT NULL,
    "reassemblyType" TEXT,
    "replacementComponentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdvancedComponent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdvancedOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StationDuration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auftragId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "stationType" TEXT NOT NULL,
    "expectedDuration" REAL NOT NULL,
    "actualDuration" REAL,
    "stochasticVariation" REAL NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StationDuration_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Auftrag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kundeId" TEXT NOT NULL,
    "produktvarianteId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'AUFTRAGSANNAHME',
    "factoryId" TEXT NOT NULL,
    "terminierung" JSONB,
    "phaseHistory" JSONB,
    "graphData" JSONB,
    "processGraphDataBg" JSONB,
    "processGraphDataBgt" JSONB,
    "processSequences" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Auftrag_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_produktvarianteId_fkey" FOREIGN KEY ("produktvarianteId") REFERENCES "Produktvariante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Auftrag" ("createdAt", "factoryId", "id", "kundeId", "phase", "produktvarianteId", "updatedAt") SELECT "createdAt", "factoryId", "id", "kundeId", "phase", "produktvarianteId", "updatedAt" FROM "Auftrag";
DROP TABLE "Auftrag";
ALTER TABLE "new_Auftrag" RENAME TO "Auftrag";
CREATE TABLE "new_Baugruppe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bezeichnung" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "variantenTyp" TEXT NOT NULL,
    "verfuegbar" INTEGER NOT NULL DEFAULT 0,
    "factoryId" TEXT NOT NULL,
    "baugruppentypId" TEXT,
    "demontagezeit" INTEGER,
    "montagezeit" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Baugruppe_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Baugruppe_baugruppentypId_fkey" FOREIGN KEY ("baugruppentypId") REFERENCES "Baugruppentyp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Baugruppe" ("artikelnummer", "baugruppentypId", "bezeichnung", "createdAt", "id", "updatedAt", "variantenTyp") SELECT "artikelnummer", "baugruppentypId", "bezeichnung", "createdAt", "id", "updatedAt", "variantenTyp" FROM "Baugruppe";
DROP TABLE "Baugruppe";
ALTER TABLE "new_Baugruppe" RENAME TO "Baugruppe";
CREATE UNIQUE INDEX "Baugruppe_artikelnummer_key" ON "Baugruppe"("artikelnummer");
CREATE TABLE "new_Baugruppentyp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bezeichnung" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Baugruppentyp_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Baugruppentyp" ("bezeichnung", "createdAt", "id", "updatedAt") SELECT "bezeichnung", "createdAt", "id", "updatedAt" FROM "Baugruppentyp";
DROP TABLE "Baugruppentyp";
ALTER TABLE "new_Baugruppentyp" RENAME TO "Baugruppentyp";
CREATE UNIQUE INDEX "Baugruppentyp_bezeichnung_factoryId_key" ON "Baugruppentyp"("bezeichnung", "factoryId");
CREATE TABLE "new_Produktvariante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produktId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "glbFile" TEXT,
    "links" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Produktvariante_produktId_fkey" FOREIGN KEY ("produktId") REFERENCES "Produkt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Produktvariante" ("bezeichnung", "createdAt", "id", "links", "produktId", "typ", "updatedAt") SELECT "bezeichnung", "createdAt", "id", "links", "produktId", "typ", "updatedAt" FROM "Produktvariante";
DROP TABLE "Produktvariante";
ALTER TABLE "new_Produktvariante" RENAME TO "Produktvariante";
CREATE TABLE "new_ReassemblyFactory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kapazität" INTEGER NOT NULL,
    "schichtmodell" TEXT NOT NULL DEFAULT 'EINSCHICHT',
    "anzahlMontagestationen" INTEGER NOT NULL DEFAULT 10,
    "targetBatchAverage" INTEGER NOT NULL DEFAULT 65,
    "pflichtUpgradeSchwelle" INTEGER NOT NULL DEFAULT 30,
    "beschaffung" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ReassemblyFactory" ("createdAt", "id", "kapazität", "name", "updatedAt") SELECT "createdAt", "id", "kapazität", "name", "updatedAt" FROM "ReassemblyFactory";
DROP TABLE "ReassemblyFactory";
ALTER TABLE "new_ReassemblyFactory" RENAME TO "ReassemblyFactory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductionStepTiming_orderId_idx" ON "ProductionStepTiming"("orderId");

-- CreateIndex
CREATE INDEX "ProductionStepTiming_stationId_idx" ON "ProductionStepTiming"("stationId");

-- CreateIndex
CREATE INDEX "DemontageTimings_orderId_idx" ON "DemontageTimings"("orderId");

-- CreateIndex
CREATE INDEX "DemontageTimings_stationId_idx" ON "DemontageTimings"("stationId");

-- CreateIndex
CREATE INDEX "AdvancedOrder_currentPhase_idx" ON "AdvancedOrder"("currentPhase");

-- CreateIndex
CREATE INDEX "AdvancedOrder_status_idx" ON "AdvancedOrder"("status");

-- CreateIndex
CREATE INDEX "AdvancedProcessStep_orderId_idx" ON "AdvancedProcessStep"("orderId");

-- CreateIndex
CREATE INDEX "AdvancedProcessStep_phase_idx" ON "AdvancedProcessStep"("phase");

-- CreateIndex
CREATE INDEX "AdvancedComponent_orderId_idx" ON "AdvancedComponent"("orderId");

-- CreateIndex
CREATE INDEX "AdvancedComponent_componentType_idx" ON "AdvancedComponent"("componentType");

-- CreateIndex
CREATE INDEX "StationDuration_auftragId_idx" ON "StationDuration"("auftragId");

-- CreateIndex
CREATE INDEX "StationDuration_stationId_idx" ON "StationDuration"("stationId");
