-- AlterTable Site: taux RG + avance forfaitaire
ALTER TABLE "Site"
  ADD COLUMN "tauxRg"            DECIMAL(5,4) NOT NULL DEFAULT 0.05,
  ADD COLUMN "avanceForfaitaire" BIGINT       NOT NULL DEFAULT 0;

-- AlterTable Situation: déduction d'avance par situation
ALTER TABLE "Situation"
  ADD COLUMN "deductionAvance" BIGINT NOT NULL DEFAULT 0;
