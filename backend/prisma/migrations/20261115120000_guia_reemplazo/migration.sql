-- Guía que reemplaza a otra anulada (corrección de kg). Res. SII 144/2026: la guía electrónica nueva referencia a la anulada.
ALTER TABLE "guias" ADD COLUMN "reemplaza_a_id" INTEGER;

CREATE UNIQUE INDEX "guias_reemplaza_a_id_key" ON "guias"("reemplaza_a_id");

ALTER TABLE "guias" ADD CONSTRAINT "guias_reemplaza_a_id_fkey" FOREIGN KEY ("reemplaza_a_id") REFERENCES "guias"("id") ON DELETE SET NULL ON UPDATE CASCADE;