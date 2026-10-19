-- Facturas de mercadería: neto/IVA, archivo adjunto y datos de anulación
ALTER TABLE "facturas" ADD COLUMN "neto" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "facturas" ADD COLUMN "iva" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "facturas" ADD COLUMN "observacion" VARCHAR(255);
ALTER TABLE "facturas" ADD COLUMN "archivo_nombre" VARCHAR(255);
ALTER TABLE "facturas" ADD COLUMN "archivo_tipo" VARCHAR(60);
ALTER TABLE "facturas" ADD COLUMN "anulada_por_id" INTEGER;
ALTER TABLE "facturas" ADD COLUMN "anulada_en" TIMESTAMP(3);

ALTER TABLE "facturas_detalle" ADD COLUMN "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
