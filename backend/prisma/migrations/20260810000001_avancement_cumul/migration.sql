-- Points d'avancement financier cumulé (attachements mensuels) — courbe en S
CREATE TABLE "AvancementCumul" (
    "id"             TEXT NOT NULL,
    "siteId"         TEXT NOT NULL,
    "date"           DATE NOT NULL,
    "libelle"        TEXT NOT NULL,
    "montantHtCumul" BIGINT NOT NULL,
    "source"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvancementCumul_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvancementCumul_siteId_date_key" ON "AvancementCumul"("siteId","date");
CREATE INDEX "AvancementCumul_siteId_date_idx" ON "AvancementCumul"("siteId","date");
ALTER TABLE "AvancementCumul" ADD CONSTRAINT "AvancementCumul_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
