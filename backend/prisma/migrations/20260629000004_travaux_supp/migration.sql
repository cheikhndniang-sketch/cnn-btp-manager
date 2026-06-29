CREATE TYPE "TSStatus" AS ENUM ('BROUILLON','VALIDE','FACTURE','PAYE');

CREATE TABLE "TravauxSupp" (
  "id"          TEXT        NOT NULL,
  "siteId"      TEXT        NOT NULL,
  "lotId"       TEXT,
  "reference"   TEXT        NOT NULL,
  "description" TEXT        NOT NULL,
  "montantHt"   BIGINT      NOT NULL DEFAULT 0,
  "tvaRate"     DECIMAL(5,4) NOT NULL DEFAULT 0.18,
  "status"      "TSStatus"  NOT NULL DEFAULT 'BROUILLON',
  "dateNotif"   DATE,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TravauxSupp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TravauxSupp_siteId_idx" ON "TravauxSupp"("siteId");
CREATE INDEX "TravauxSupp_siteId_status_idx" ON "TravauxSupp"("siteId", "status");

ALTER TABLE "TravauxSupp"
  ADD CONSTRAINT "TravauxSupp_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TravauxSupp"
  ADD CONSTRAINT "TravauxSupp_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
