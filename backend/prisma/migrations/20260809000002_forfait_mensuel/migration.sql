-- Rémunération au mois de 30 jours calendaires (proratisée sur 30 j)
ALTER TABLE "Ouvrier" ADD COLUMN "forfaitMensuel" BOOLEAN NOT NULL DEFAULT false;
