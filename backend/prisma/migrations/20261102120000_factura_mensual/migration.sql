-- Facturación mensual: factura electrónica (DTE 33) por las guías del mes de cada cliente

-- Factura que cobra cada guía (null = aún no facturada)
ALTER TABLE "guias" ADD COLUMN "factura_mensual_id" INTEGER;

CREATE TABLE "facturas_mensuales" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "periodo" DATE NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "kg" DECIMAL(12,3) NOT NULL,
    "monto_guias" DECIMAL(14,2) NOT NULL,
    "neto" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "detalle" JSONB NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VIGENTE',
    "motivo_anulacion" VARCHAR(255),
    "anulada_por_id" INTEGER,
    "anulada_en" TIMESTAMP(3),
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

    CONSTRAINT "facturas_mensuales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "facturas_mensuales_periodo_cliente_id_idx" ON "facturas_mensuales"("periodo", "cliente_id");
CREATE INDEX "facturas_mensuales_dte_estado_idx" ON "facturas_mensuales"("dte_estado");
CREATE INDEX "guias_factura_mensual_id_idx" ON "guias"("factura_mensual_id");

ALTER TABLE "guias" ADD CONSTRAINT "guias_factura_mensual_id_fkey" FOREIGN KEY ("factura_mensual_id") REFERENCES "facturas_mensuales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facturas_mensuales" ADD CONSTRAINT "facturas_mensuales_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
