-- CreateTable
CREATE TABLE "Baugruppentyp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bezeichnung" TEXT NOT NULL,
    "beschreibung" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReassemblyFactory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kapazität" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Kunde" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "adresse" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Auftrag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kundeId" TEXT NOT NULL,
    "produktvarianteId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'ERSTKONTAKT',
    "upgradeTyp" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Auftrag_kundeId_fkey" FOREIGN KEY ("kundeId") REFERENCES "Kunde" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_produktvarianteId_fkey" FOREIGN KEY ("produktvarianteId") REFERENCES "Produktvariante" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Auftrag_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Liefertermin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auftragId" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "datum" DATETIME NOT NULL,
    "istAktuell" BOOLEAN NOT NULL DEFAULT true,
    "bemerkung" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Liefertermin_auftragId_fkey" FOREIGN KEY ("auftragId") REFERENCES "Auftrag" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Produkt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bezeichnung" TEXT NOT NULL,
    "seriennummer" TEXT NOT NULL,
    "factoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Produkt_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "ReassemblyFactory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Produktvariante" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produktId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "links" JSONB NOT NULL,
    "zustand" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Produktvariante_produktId_fkey" FOREIGN KEY ("produktId") REFERENCES "Produkt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Baugruppe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bezeichnung" TEXT NOT NULL,
    "artikelnummer" TEXT NOT NULL,
    "variantenTyp" TEXT NOT NULL,
    "baugruppentypId" TEXT,
    "prozesszeit" INTEGER,
    "volumen" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Baugruppe_baugruppentypId_fkey" FOREIGN KEY ("baugruppentypId") REFERENCES "Baugruppentyp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prozess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_BaugruppentypToProdukt" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BaugruppentypToProdukt_A_fkey" FOREIGN KEY ("A") REFERENCES "Baugruppentyp" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BaugruppentypToProdukt_B_fkey" FOREIGN KEY ("B") REFERENCES "Produkt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BaugruppeToProduktvariante" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BaugruppeToProduktvariante_A_fkey" FOREIGN KEY ("A") REFERENCES "Baugruppe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BaugruppeToProduktvariante_B_fkey" FOREIGN KEY ("B") REFERENCES "Produktvariante" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BaugruppeToProzess" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BaugruppeToProzess_A_fkey" FOREIGN KEY ("A") REFERENCES "Baugruppe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BaugruppeToProzess_B_fkey" FOREIGN KEY ("B") REFERENCES "Prozess" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Baugruppentyp_bezeichnung_key" ON "Baugruppentyp"("bezeichnung");

-- CreateIndex
CREATE UNIQUE INDEX "Kunde_email_key" ON "Kunde"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Produkt_seriennummer_key" ON "Produkt"("seriennummer");

-- CreateIndex
CREATE UNIQUE INDEX "Baugruppe_artikelnummer_key" ON "Baugruppe"("artikelnummer");

-- CreateIndex
CREATE UNIQUE INDEX "_BaugruppentypToProdukt_AB_unique" ON "_BaugruppentypToProdukt"("A", "B");

-- CreateIndex
CREATE INDEX "_BaugruppentypToProdukt_B_index" ON "_BaugruppentypToProdukt"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BaugruppeToProduktvariante_AB_unique" ON "_BaugruppeToProduktvariante"("A", "B");

-- CreateIndex
CREATE INDEX "_BaugruppeToProduktvariante_B_index" ON "_BaugruppeToProduktvariante"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BaugruppeToProzess_AB_unique" ON "_BaugruppeToProzess"("A", "B");

-- CreateIndex
CREATE INDEX "_BaugruppeToProzess_B_index" ON "_BaugruppeToProzess"("B");
