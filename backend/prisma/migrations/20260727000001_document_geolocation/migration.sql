-- Géolocalisation des documents (photos terrain, cf. mémoire XVI.4.1)
ALTER TABLE "Document" ADD COLUMN "latitude"  DOUBLE PRECISION;
ALTER TABLE "Document" ADD COLUMN "longitude" DOUBLE PRECISION;
