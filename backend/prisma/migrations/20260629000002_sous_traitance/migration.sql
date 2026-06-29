-- CreateEnum
CREATE TYPE "ContratSTStatus" AS ENUM ('ACTIF', 'TERMINE', 'RESILIE');
CREATE TYPE "SituationSTStatus" AS ENUM ('BROUILLON', 'VALIDEE', 'PAYEE');

-- CreateTable SousTraitant
CREATE TABLE "SousTraitant" (
  "id"        TEXT         NOT NULL,
  "siteId"    TEXT         NOT NULL,
  "nom"       TEXT         NOT NULL,
  "contact"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SousTraitant_pkey" PRIMARY KEY ("id")
);

-- CreateTable ContratST
CREATE TABLE "ContratST" (
  "id"                TEXT               NOT NULL,
  "siteId"            TEXT               NOT NULL,
  "sousTraitantId"    TEXT               NOT NULL,
  "lotId"             TEXT,
  "reference"         TEXT               NOT NULL,
  "intitule"          TEXT               NOT NULL,
  "montantHt"         BIGINT             NOT NULL DEFAULT 0,
  "tvaRate"           DECIMAL(5,4)       NOT NULL DEFAULT 0.18,
  "tauxRg"            DECIMAL(5,4)       NOT NULL DEFAULT 0.05,
  "avanceForfaitaire" BIGINT             NOT NULL DEFAULT 0,
  "status"            "ContratSTStatus"  NOT NULL DEFAULT 'ACTIF',
  "startDate"         DATE,
  "endDate"           DATE,
  "createdAt"         TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContratST_pkey" PRIMARY KEY ("id")
);

-- CreateTable SituationST
CREATE TABLE "SituationST" (
  "id"               TEXT                  NOT NULL,
  "contratId"        TEXT                  NOT NULL,
  "siteId"           TEXT                  NOT NULL,
  "numero"           INTEGER               NOT NULL,
  "periode"          TEXT                  NOT NULL,
  "dateEmission"     DATE                  NOT NULL,
  "status"           "SituationSTStatus"   NOT NULL DEFAULT 'BROUILLON',
  "montantHtPeriode" BIGINT                NOT NULL DEFAULT 0,
  "deductionAvance"  BIGINT                NOT NULL DEFAULT 0,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SituationST_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "SousTraitant_siteId_idx"  ON "SousTraitant"("siteId");
CREATE INDEX "ContratST_siteId_idx"     ON "ContratST"("siteId");
CREATE INDEX "ContratST_sousTraitantId_idx" ON "ContratST"("sousTraitantId");
CREATE UNIQUE INDEX "SituationST_contratId_numero_key" ON "SituationST"("contratId", "numero");
CREATE INDEX "SituationST_contratId_idx" ON "SituationST"("contratId");
CREATE INDEX "SituationST_siteId_idx"   ON "SituationST"("siteId");

-- ForeignKeys
ALTER TABLE "SousTraitant"
  ADD CONSTRAINT "SousTraitant_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratST"
  ADD CONSTRAINT "ContratST_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContratST"
  ADD CONSTRAINT "ContratST_sousTraitantId_fkey"
  FOREIGN KEY ("sousTraitantId") REFERENCES "SousTraitant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContratST"
  ADD CONSTRAINT "ContratST_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SituationST"
  ADD CONSTRAINT "SituationST_contratId_fkey"
  FOREIGN KEY ("contratId") REFERENCES "ContratST"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SituationST"
  ADD CONSTRAINT "SituationST_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
