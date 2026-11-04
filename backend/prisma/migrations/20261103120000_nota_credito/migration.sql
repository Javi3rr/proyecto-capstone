-- Nota de crédito electrónica (DTE 61): anula en el SII una factura mensual ya emitida

CREATE TABLE "notas_credito" (
    "id" SERIAL NOT NULL,
    "factura_mensual_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" VARCHAR(255) NOT NULL,
    "neto" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dte_estado" "EstadoDte" NOT NULL DEFAULT 'NO_ENVIADA',
    "dte_folio" INTEGER,
    "dte_ambiente" VARCHAR(12),
    "dte_token" VARCHAR(200),
    "dte_intentos" INTEGER NOT NULL DEFAULT 0,
    "dte_error" VARCHAR(1000),
    "dte_pdf_path" VARCHAR(255),
    "dte_xml_path" VARCHAR(255),
    "dte_emitida_en" TIMESTAMP(3),
    "dte_emitida_por_id" INTEGER,

    CONSTRAINT "notas_credito_pkey" PRIMARY KEY ("id")
);

-- Una sola nota de crédito por factura (anulación total)
CREATE UNIQUE INDEX "notas_credito_factura_mensual_id_key" ON "notas_credito"("factura_mensual_id");

ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_factura_mensual_id_fkey" FOREIGN KEY ("factura_mensual_id") REFERENCES "facturas_mensuales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
