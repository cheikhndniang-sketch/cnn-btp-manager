-- Migration: Pointage par heures + paie droit sénégalais
-- Ouvrier : matricule + renommage tauxJournalier → salaireBase (mensuel)
-- Pointage : heures de nuit + indicateur férié

ALTER TABLE "Ouvrier" ADD COLUMN "matricule" TEXT;
CREATE INDEX "Ouvrier_siteId_matricule_idx" ON "Ouvrier"("siteId", "matricule");

ALTER TABLE "Ouvrier" RENAME COLUMN "tauxJournalier" TO "salaireBase";

ALTER TABLE "Pointage" ADD COLUMN "heuresNuit" DECIMAL(4,1) NOT NULL DEFAULT 0;
ALTER TABLE "Pointage" ADD COLUMN "jourFerie"  BOOLEAN NOT NULL DEFAULT false;
