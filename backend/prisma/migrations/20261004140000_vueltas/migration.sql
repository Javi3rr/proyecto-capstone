-- Vueltas del día (columnas del cuaderno): 1 = mañana, 2 = tarde 1, 3 = tarde 2

-- AlterTable
ALTER TABLE "despachos" ADD COLUMN "vuelta" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "guias" ADD COLUMN "vuelta" INTEGER NOT NULL DEFAULT 1;

-- Una línea por cliente, día y vuelta
DROP INDEX "despachos_jornada_id_cliente_id_key";
CREATE UNIQUE INDEX "despachos_jornada_id_cliente_id_vuelta_key" ON "despachos"("jornada_id", "cliente_id", "vuelta");
