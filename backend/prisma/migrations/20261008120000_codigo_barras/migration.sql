-- Código de barras de cada producto (ScannerMap de las balanzas CAS)
ALTER TABLE "productos" ADD COLUMN "codigo_barras" VARCHAR(20);
CREATE INDEX "productos_codigo_barras_idx" ON "productos"("codigo_barras");
