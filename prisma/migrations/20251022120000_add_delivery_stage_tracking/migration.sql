-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Auftrag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kundeId" TEXT NOT NULL,
    "produktvarianteId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'AUFTRAGSANNAHME',
    "factoryId" TEXT NOT NULL,
    "terminierung" TEXT,
    "phaseHistory" TEXT,
    "graphData" TEXT,
    "processGraphDataBg" TEXT,
    "processGraphDataBgt" TEXT,
    "processSequences" TEXT,
    "dispatcherOrderPreAcceptance" INTEGER,
    "dispatcherOrderPreInspection" INTEGER,
    "dispatcherOrderPostInspection" INTEGER,
    "plannedDeliverySimMinute" REAL,
    "finalCompletionSimMinute" REAL,
    "deliveryAfterAcceptanceSimMinute" REAL,
    "deliveryAfterInspectionSimMinute" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Auftrag_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_produktvarianteId_fkey" FOREIGN KEY ("produktvarianteId") REFERENCES "Produktvariante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Auftrag" ("createdAt", "dispatcherOrderPostInspection", "dispatcherOrderPreAcceptance", "dispatcherOrderPreInspection", "factoryId", "finalCompletionSimMinute", "graphData", "id", "kundeId", "phase", "phaseHistory", "plannedDeliverySimMinute", "processGraphDataBg", "processGraphDataBgt", "processSequences", "produktvarianteId", "terminierung", "updatedAt") SELECT "createdAt", "dispatcherOrderPostInspection", "dispatcherOrderPreAcceptance", "dispatcherOrderPreInspection", "factoryId", "finalCompletionSimMinute", "graphData", "id", "kundeId", "phase", "phaseHistory", "plannedDeliverySimMinute", "processGraphDataBg", "processGraphDataBgt", "processSequences", "produktvarianteId", "terminierung", "updatedAt" FROM "Auftrag";
DROP TABLE "Auftrag";
ALTER TABLE "new_Auftrag" RENAME TO "Auftrag";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
