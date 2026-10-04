-- Un pago por cliente y día de cuadre (se registra desde el cuadre)
DROP INDEX IF EXISTS "pagos_cliente_id_fecha_idx";

ALTER TABLE "pagos" ADD COLUMN "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "pagos_cliente_id_fecha_key" ON "pagos"("cliente_id", "fecha");
