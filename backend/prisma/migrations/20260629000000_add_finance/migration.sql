-- AlterTable: add montantMarcheHt to Lot
ALTER TABLE "Lot" ADD COLUMN "montantMarcheHt" BIGINT NOT NULL DEFAULT 0;

-- CreateEnum: SituationStatus
CREATE TYPE "SituationStatus" AS ENUM ('BROUILLON', 'VALIDEE', 'PAYEE');

-- CreateTable: Situation
CREATE TABLE "Situation" (
    "id"           TEXT NOT NULL,
    "siteId"       TEXT NOT NULL,
    "numero"       INTEGER NOT NULL,
    "periode"      TEXT NOT NULL,
    "dateEmission" DATE NOT NULL,
    "status"       "SituationStatus" NOT NULL DEFAULT 'BROUILLON',
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Situation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SituationLigne
CREATE TABLE "SituationLigne" (
    "id"              TEXT NOT NULL,
    "situationId"     TEXT NOT NULL,
    "lotId"           TEXT NOT NULL,
    "avancementCumul" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SituationLigne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Situation_siteId_numero_key" ON "Situation"("siteId", "numero");
CREATE INDEX "Situation_siteId_idx" ON "Situation"("siteId");
CREATE UNIQUE INDEX "SituationLigne_situationId_lotId_key" ON "SituationLigne"("situationId", "lotId");
CREATE INDEX "SituationLigne_situationId_idx" ON "SituationLigne"("situationId");
CREATE INDEX "SituationLigne_lotId_idx" ON "SituationLigne"("lotId");

-- AddForeignKey
ALTER TABLE "Situation" ADD CONSTRAINT "Situation_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SituationLigne" ADD CONSTRAINT "SituationLigne_situationId_fkey"
    FOREIGN KEY ("situationId") REFERENCES "Situation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SituationLigne" ADD CONSTRAINT "SituationLigne_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
