-- Guía de despacho electrónica (DTE 52) integrada con el SII a través de un proveedor con API

-- Datos tributarios del cliente (receptor de la guía)
ALTER TABLE "clientes" ADD COLUMN "rut" VARCHAR(12);
ALTER TABLE "clientes" ADD COLUMN "razon_social" VARCHAR(100);
ALTER TABLE "clientes" ADD COLUMN "giro" VARCHAR(80);
ALTER TABLE "clientes" ADD COLUMN "comuna" VARCHAR(40);

-- Estado de la guía ante el SII
CREATE TYPE "EstadoDte" AS ENUM ('NO_ENVIADA', 'EMITIDA', 'RECHAZADA');
ALTER TABLE "guias" ADD COLUMN "dte_estado" "EstadoDte" NOT NULL DEFAULT 'NO_ENVIADA';
ALTER TABLE "guias" ADD COLUMN "dte_folio" INTEGER;
ALTER TABLE "guias" ADD COLUMN "dte_ambiente" VARCHAR(12);
ALTER TABLE "guias" ADD COLUMN "dte_token" VARCHAR(200);
ALTER TABLE "guias" ADD COLUMN "dte_intentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "guias" ADD COLUMN "dte_error" VARCHAR(1000);
ALTER TABLE "guias" ADD COLUMN "dte_pdf_path" VARCHAR(255);
ALTER TABLE "guias" ADD COLUMN "dte_xml_path" VARCHAR(255);
ALTER TABLE "guias" ADD COLUMN "dte_emitida_en" TIMESTAMP(3);
ALTER TABLE "guias" ADD COLUMN "dte_emitida_por_id" INTEGER;
CREATE INDEX "guias_dte_estado_idx" ON "guias"("dte_estado");
