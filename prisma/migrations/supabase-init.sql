-- CreateTable
CREATE TABLE "Baugruppentyp" (
    "id" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Baugruppentyp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReassemblyFactory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kapazität" INTEGER NOT NULL,
    "schichtmodell" TEXT NOT NULL DEFAULT 'EINSCHICHT',
    "anzahlMontagestationen" INTEGER NOT NULL DEFAULT 10,
    "targetBatchAverage" INTEGER NOT NULL DEFAULT 65,
    "pflichtUpgradeSchwelle" INTEGER NOT NULL DEFAULT 30,
    "beschaffung" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReassemblyFactory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kunde" (
    "id" TEXT NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "adresse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kunde_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auftrag" (
    "id" TEXT NOT NULL,
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
    "dispatcherOrderPreAcceptance" INTEGER,
    "dispatcherOrderPreInspection" INTEGER,
    "dispatcherOrderPostInspection" INTEGER,
    "plannedDeliverySimMinute" DOUBLE PRECISION,
    "finalCompletionSimMinute" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auftrag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liefertermin" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "istAktuell" BOOLEAN NOT NULL DEFAULT true,
    "bemerkung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liefertermin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produkt" (
    "id" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "seriennummer" TEXT NOT NULL,
    "factoryId" TEXT,
    "graphData" JSONB,
    "processGraphData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produkt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produktvariante" (
    "id" TEXT NOT NULL,
    "produktId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "glbFile" TEXT,
    "links" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produktvariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baugruppe" (
    "id" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "variantenTyp" TEXT NOT NULL,
    "verfuegbar" INTEGER NOT NULL DEFAULT 0,
    "factoryId" TEXT NOT NULL,
    "baugruppentypId" TEXT,
    "demontagezeit" INTEGER,
    "montagezeit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Baugruppe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaugruppeInstance" (
    "id" TEXT NOT NULL,
    "baugruppeId" TEXT NOT NULL,
    "austauschBaugruppeId" TEXT,
    "auftragId" TEXT NOT NULL,
    "zustand" INTEGER NOT NULL,
    "reAssemblyTyp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaugruppeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prozess" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prozess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStepTiming" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "simulationTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "simulationStartTime" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "stepType" TEXT NOT NULL DEFAULT 'assembly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionStepTiming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemontageTimings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "simulationTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemontageTimings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedOrder" (
    "id" TEXT NOT NULL,
    "displayId" TEXT,
    "customerName" TEXT NOT NULL,
    "productVariantName" TEXT NOT NULL,
    "productVariantType" TEXT NOT NULL,
    "currentPhase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "totalProcessingTime" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "reassemblyReason" TEXT,
    "requiresReassembly" BOOLEAN NOT NULL DEFAULT false,
    "assignedLineNumber" INTEGER,
    "needsQualityRework" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvancedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedProcessStep" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "wasRework" BOOLEAN NOT NULL DEFAULT false,
    "disruptionOccurred" BOOLEAN NOT NULL DEFAULT false,
    "disruptionDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvancedProcessStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvancedComponent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "conditionPercentage" INTEGER NOT NULL,
    "reassemblyType" TEXT,
    "replacementComponentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvancedComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationDuration" (
    "id" TEXT NOT NULL,
    "auftragId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "stationType" TEXT NOT NULL,
    "expectedDuration" DOUBLE PRECISION NOT NULL,
    "actualDuration" DOUBLE PRECISION,
    "stochasticVariation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StationDuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAcceptanceQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreAcceptanceQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreInspectionQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreInspectionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostInspectionQueue" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "possibleSequence" JSONB,
    "processTimes" JSONB,
    "processingOrder" INTEGER NOT NULL DEFAULT 0,
    "releaseAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "queuedAtSimMinute" INTEGER NOT NULL DEFAULT 0,
    "releasedAtSimMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostInspectionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueConfig" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "preAcceptanceReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "preInspectionReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "postInspectionReleaseMinutes" INTEGER NOT NULL DEFAULT 0,
    "preAcceptancePythonScript" TEXT,
    "preInspectionPythonScript" TEXT,
    "postInspectionPythonScript" TEXT,
    "preAcceptanceBatchStartSimMinute" INTEGER,
    "preInspectionBatchStartSimMinute" INTEGER,
    "postInspectionBatchStartSimMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BaugruppentypToProdukt" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BaugruppentypToProdukt_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BaugruppeToProzess" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BaugruppeToProzess_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Baugruppentyp_bezeichnung_factoryId_key" ON "Baugruppentyp"("bezeichnung", "factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Kunde_email_key" ON "Kunde"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Produkt_seriennummer_key" ON "Produkt"("seriennummer");

-- CreateIndex
CREATE UNIQUE INDEX "Baugruppe_artikelnummer_key" ON "Baugruppe"("artikelnummer");

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

-- CreateIndex
CREATE INDEX "_BaugruppentypToProdukt_B_index" ON "_BaugruppentypToProdukt"("B");

-- CreateIndex
CREATE INDEX "_BaugruppeToProzess_B_index" ON "_BaugruppeToProzess"("B");

-- AddForeignKey
ALTER TABLE "Baugruppentyp" ADD CONSTRAINT "Baugruppentyp_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auftrag" ADD CONSTRAINT "Auftrag_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auftrag" ADD CONSTRAINT "Auftrag_produktvarianteId_fkey" FOREIGN KEY ("produktvarianteId") REFERENCES "Produktvariante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auftrag" ADD CONSTRAINT "Auftrag_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liefertermin" ADD CONSTRAINT "Liefertermin_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produkt" ADD CONSTRAINT "Produkt_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produktvariante" ADD CONSTRAINT "Produktvariante_produktId_fkey" FOREIGN KEY ("produktId") REFERENCES "Produkt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baugruppe" ADD CONSTRAINT "Baugruppe_baugruppentypId_fkey" FOREIGN KEY ("baugruppentypId") REFERENCES "Baugruppentyp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baugruppe" ADD CONSTRAINT "Baugruppe_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaugruppeInstance" ADD CONSTRAINT "BaugruppeInstance_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaugruppeInstance" ADD CONSTRAINT "BaugruppeInstance_austauschBaugruppeId_fkey" FOREIGN KEY ("austauschBaugruppeId") REFERENCES "Baugruppe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaugruppeInstance" ADD CONSTRAINT "BaugruppeInstance_baugruppeId_fkey" FOREIGN KEY ("baugruppeId") REFERENCES "Baugruppe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancedProcessStep" ADD CONSTRAINT "AdvancedProcessStep_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdvancedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancedComponent" ADD CONSTRAINT "AdvancedComponent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdvancedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationDuration" ADD CONSTRAINT "StationDuration_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAcceptanceQueue" ADD CONSTRAINT "PreAcceptanceQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreInspectionQueue" ADD CONSTRAINT "PreInspectionQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostInspectionQueue" ADD CONSTRAINT "PostInspectionQueue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Auftrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueConfig" ADD CONSTRAINT "QueueConfig_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaugruppentypToProdukt" ADD CONSTRAINT "_BaugruppentypToProdukt_A_fkey" FOREIGN KEY ("A") REFERENCES "Baugruppentyp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaugruppentypToProdukt" ADD CONSTRAINT "_BaugruppentypToProdukt_B_fkey" FOREIGN KEY ("B") REFERENCES "Produkt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaugruppeToProzess" ADD CONSTRAINT "_BaugruppeToProzess_A_fkey" FOREIGN KEY ("A") REFERENCES "Baugruppe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BaugruppeToProzess" ADD CONSTRAINT "_BaugruppeToProzess_B_fkey" FOREIGN KEY ("B") REFERENCES "Prozess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
