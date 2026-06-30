-- Journal de chantier + Avenants au marché

CREATE TYPE "Meteo" AS ENUM ('SOLEIL', 'NUAGEUX', 'PLUIE', 'ORAGE');

CREATE TABLE "RapportChantier" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "siteId"          TEXT NOT NULL,
    "date"            DATE NOT NULL,
    "meteo"           "Meteo",
    "effectif"        INTEGER NOT NULL DEFAULT 0,
    "travauxRealises" TEXT,
    "materiaux"       TEXT,
    "observations"    TEXT,
    "incidents"       TEXT,
    "redacteurId"     TEXT,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "RapportChantier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RapportChantier_siteId_date_key" UNIQUE ("siteId", "date"),
    CONSTRAINT "RapportChantier_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE
);

CREATE INDEX "RapportChantier_siteId_idx" ON "RapportChantier"("siteId");

CREATE TABLE "Avenant" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "siteId"          TEXT NOT NULL,
    "numero"          INTEGER NOT NULL,
    "objet"           TEXT NOT NULL,
    "montantHt"       BIGINT NOT NULL DEFAULT 0,
    "dateNotif"       DATE NOT NULL,
    "dateApprobation" DATE,
    "notes"           TEXT,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "Avenant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Avenant_siteId_numero_key" UNIQUE ("siteId", "numero"),
    CONSTRAINT "Avenant_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE
);

CREATE INDEX "Avenant_siteId_idx" ON "Avenant"("siteId");
