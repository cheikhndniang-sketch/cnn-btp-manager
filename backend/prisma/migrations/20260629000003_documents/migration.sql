-- CreateEnum
CREATE TYPE "DocCategorie" AS ENUM (
  'PV','COMPTE_RENDU','ATTACHEMENT','FACTURE','PLAN','PHOTO','CONTRAT','COURRIER','AUTRE'
);

-- CreateTable
CREATE TABLE "Document" (
  "id"          TEXT         NOT NULL,
  "siteId"      TEXT         NOT NULL,
  "uploadedBy"  TEXT         NOT NULL,
  "nom"         TEXT         NOT NULL,
  "categorie"   "DocCategorie" NOT NULL DEFAULT 'AUTRE',
  "mimetype"    TEXT         NOT NULL,
  "taille"      INTEGER      NOT NULL,
  "contenu"     BYTEA        NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_siteId_categorie_idx" ON "Document"("siteId", "categorie");
CREATE INDEX "Document_siteId_createdAt_idx" ON "Document"("siteId", "createdAt");

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
