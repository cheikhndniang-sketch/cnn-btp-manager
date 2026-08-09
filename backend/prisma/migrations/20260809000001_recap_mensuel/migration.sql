-- Prestataires (gardiens, stagiaires) non assujettis aux cotisations
ALTER TABLE "Ouvrier" ADD COLUMN "exonereCotisations" BOOLEAN NOT NULL DEFAULT false;

-- Récapitulatifs mensuels repris des états de paie existants
CREATE TABLE "RecapMensuel" (
    "id"             TEXT NOT NULL,
    "ouvrierId"      TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "mois"           TEXT NOT NULL,
    "heuresNormales" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "heuresHs15"     DECIMAL(7,2) NOT NULL DEFAULT 0,
    "heuresHs40"     DECIMAL(7,2) NOT NULL DEFAULT 0,
    "heuresHs60"     DECIMAL(7,2) NOT NULL DEFAULT 0,
    "heuresHs100"    DECIMAL(7,2) NOT NULL DEFAULT 0,
    "nbPaniers"      INTEGER NOT NULL DEFAULT 0,
    "joursTransport" INTEGER NOT NULL DEFAULT 0,
    "emploi"         TEXT,
    "source"         TEXT,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecapMensuel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecapMensuel_ouvrierId_mois_key" ON "RecapMensuel"("ouvrierId", "mois");
CREATE INDEX "RecapMensuel_siteId_mois_idx" ON "RecapMensuel"("siteId", "mois");

ALTER TABLE "RecapMensuel" ADD CONSTRAINT "RecapMensuel_ouvrierId_fkey"
    FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecapMensuel" ADD CONSTRAINT "RecapMensuel_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
