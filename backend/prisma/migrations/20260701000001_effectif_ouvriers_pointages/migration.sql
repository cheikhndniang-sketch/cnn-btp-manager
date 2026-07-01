-- Migration: suivi effectif et salaires
CREATE TYPE "QualificationOuvrier" AS ENUM (
  'MANOEUVRE', 'OUVRIER_SPECIALISE', 'CHEF_EQUIPE',
  'TECHNICIEN', 'AGENT_MAITRISE', 'INGENIEUR', 'AUTRE'
);

CREATE TABLE "Ouvrier" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "siteId"         TEXT NOT NULL,
    "nom"            TEXT NOT NULL,
    "prenom"         TEXT,
    "fonction"       TEXT,
    "qualification"  "QualificationOuvrier" NOT NULL DEFAULT 'MANOEUVRE',
    "tauxJournalier" BIGINT NOT NULL DEFAULT 0,
    "dateEntree"     DATE NOT NULL,
    "dateSortie"     DATE,
    "actif"          BOOLEAN NOT NULL DEFAULT true,
    "telephone"      TEXT,
    "notes"          TEXT,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Ouvrier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Ouvrier_siteId_fkey" FOREIGN KEY ("siteId")
        REFERENCES "Site"("id") ON DELETE CASCADE
);
CREATE INDEX "Ouvrier_siteId_idx" ON "Ouvrier"("siteId");
CREATE INDEX "Ouvrier_siteId_actif_idx" ON "Ouvrier"("siteId", "actif");

CREATE TABLE "Pointage" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "ouvrierId" TEXT NOT NULL,
    "siteId"    TEXT NOT NULL,
    "date"      DATE NOT NULL,
    "present"   BOOLEAN NOT NULL DEFAULT true,
    "heures"    DECIMAL(4,1) NOT NULL DEFAULT 8,
    "notes"     TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Pointage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Pointage_ouvrierId_date_key" UNIQUE ("ouvrierId", "date"),
    CONSTRAINT "Pointage_ouvrierId_fkey" FOREIGN KEY ("ouvrierId")
        REFERENCES "Ouvrier"("id") ON DELETE CASCADE,
    CONSTRAINT "Pointage_siteId_fkey" FOREIGN KEY ("siteId")
        REFERENCES "Site"("id") ON DELETE CASCADE
);
CREATE INDEX "Pointage_siteId_date_idx" ON "Pointage"("siteId", "date");
CREATE INDEX "Pointage_ouvrierId_idx" ON "Pointage"("ouvrierId");
