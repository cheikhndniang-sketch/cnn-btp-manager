-- Prime panier et prime de transport (Décret sénégalais)
ALTER TABLE "Ouvrier" ADD COLUMN "tauxPanier"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ouvrier" ADD COLUMN "tauxTransport" INTEGER NOT NULL DEFAULT 0;
