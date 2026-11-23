-- Normalización del modelo de datos (3FN)
--  1. documentos_sii: los datos de emisión ante el SII, antes repetidos en guías, facturas y notas de crédito.
--  2. guias: cliente, repartidor, fecha y vuelta se obtienen de su despacho.
--  3. Columnas calculables fuera: despachos.monto, facturas_mensuales.kg/monto_guias, notas_credito.neto/iva/total,
--     facturas_detalle.subtotal, importaciones_balanza.total_monto y conteos_detalle.diferencia.
--  4. El código de mesonera pasa a ser clave foránea a usuarios(codigo).
-- Los datos existentes se trasladan antes de eliminar columnas.

-- 1. Documentos SII ---------------------------------------------------------------
CREATE TABLE "documentos_sii" (
    "id" SERIAL NOT NULL,
    "tipo" INTEGER NOT NULL,
    "estado" "EstadoDte" NOT NULL DEFAULT 'NO_ENVIADA',
    "folio" INTEGER,
    "ambiente" VARCHAR(12),
    "token" VARCHAR(200),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(1000),
    "pdf_path" VARCHAR(255),
    "xml_path" VARCHAR(255),
    "emitido_en" TIMESTAMP(3),
    "emitido_por_id" INTEGER,
    "anulado_en" TIMESTAMP(3),
    "anulado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- columnas temporales para el traslado
    "origen_tabla" VARCHAR(20),
    "origen_id" INTEGER,

    CONSTRAINT "documentos_sii_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "guias" ADD COLUMN "documento_sii_id" INTEGER;
ALTER TABLE "facturas_mensuales" ADD COLUMN "documento_sii_id" INTEGER;
ALTER TABLE "notas_credito" ADD COLUMN "documento_sii_id" INTEGER;

-- Solo se crea un documento si hubo emisión o al menos un intento
INSERT INTO "documentos_sii" ("tipo", "estado", "folio", "ambiente", "token", "intentos", "error", "pdf_path", "xml_path",
                              "emitido_en", "emitido_por_id", "anulado_en", "anulado_por_id", "creado_en", "origen_tabla", "origen_id")
SELECT 52, "dte_estado", "dte_folio", "dte_ambiente", "dte_token", "dte_intentos", "dte_error", "dte_pdf_path", "dte_xml_path",
       "dte_emitida_en", "dte_emitida_por_id", "dte_anulada_en", "dte_anulada_por_id", COALESCE("dte_emitida_en", "creado_en"), 'guias', "id"
FROM "guias" WHERE "dte_estado" <> 'NO_ENVIADA' OR "dte_intentos" > 0;

INSERT INTO "documentos_sii" ("tipo", "estado", "folio", "ambiente", "token", "intentos", "error", "pdf_path", "xml_path",
                              "emitido_en", "emitido_por_id", "creado_en", "origen_tabla", "origen_id")
SELECT 33, "dte_estado", "dte_folio", "dte_ambiente", "dte_token", "dte_intentos", "dte_error", "dte_pdf_path", "dte_xml_path",
       "dte_emitida_en", "dte_emitida_por_id", COALESCE("dte_emitida_en", "creado_en"), 'facturas_mensuales', "id"
FROM "facturas_mensuales" WHERE "dte_estado" <> 'NO_ENVIADA' OR "dte_intentos" > 0;

INSERT INTO "documentos_sii" ("tipo", "estado", "folio", "ambiente", "token", "intentos", "error", "pdf_path", "xml_path",
                              "emitido_en", "emitido_por_id", "creado_en", "origen_tabla", "origen_id")
SELECT 61, "dte_estado", "dte_folio", "dte_ambiente", "dte_token", "dte_intentos", "dte_error", "dte_pdf_path", "dte_xml_path",
       "dte_emitida_en", "dte_emitida_por_id", COALESCE("dte_emitida_en", "creado_en"), 'notas_credito', "id"
FROM "notas_credito" WHERE "dte_estado" <> 'NO_ENVIADA' OR "dte_intentos" > 0;

UPDATE "guias" g SET "documento_sii_id" = d."id" FROM "documentos_sii" d WHERE d."origen_tabla" = 'guias' AND d."origen_id" = g."id";
UPDATE "facturas_mensuales" f SET "documento_sii_id" = d."id" FROM "documentos_sii" d WHERE d."origen_tabla" = 'facturas_mensuales' AND d."origen_id" = f."id";
UPDATE "notas_credito" n SET "documento_sii_id" = d."id" FROM "documentos_sii" d WHERE d."origen_tabla" = 'notas_credito' AND d."origen_id" = n."id";

ALTER TABLE "documentos_sii" DROP COLUMN "origen_tabla", DROP COLUMN "origen_id";

CREATE INDEX "documentos_sii_tipo_ambiente_folio_idx" ON "documentos_sii"("tipo", "ambiente", "folio");
CREATE INDEX "documentos_sii_estado_idx" ON "documentos_sii"("estado");
CREATE UNIQUE INDEX "guias_documento_sii_id_key" ON "guias"("documento_sii_id");
CREATE UNIQUE INDEX "facturas_mensuales_documento_sii_id_key" ON "facturas_mensuales"("documento_sii_id");
CREATE UNIQUE INDEX "notas_credito_documento_sii_id_key" ON "notas_credito"("documento_sii_id");

ALTER TABLE "guias" ADD CONSTRAINT "guias_documento_sii_id_fkey" FOREIGN KEY ("documento_sii_id") REFERENCES "documentos_sii"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facturas_mensuales" ADD CONSTRAINT "facturas_mensuales_documento_sii_id_fkey" FOREIGN KEY ("documento_sii_id") REFERENCES "documentos_sii"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_credito" ADD CONSTRAINT "notas_credito_documento_sii_id_fkey" FOREIGN KEY ("documento_sii_id") REFERENCES "documentos_sii"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. y 3. Columnas repetidas o calculables ------------------------------------------
ALTER TABLE "guias" DROP CONSTRAINT "guias_cliente_id_fkey";
ALTER TABLE "guias" DROP CONSTRAINT "guias_repartidor_id_fkey";
DROP INDEX "guias_cliente_id_fecha_idx";
DROP INDEX "guias_fecha_idx";
DROP INDEX "guias_dte_estado_idx";
DROP INDEX "facturas_mensuales_dte_estado_idx";

ALTER TABLE "guias" DROP COLUMN "cliente_id",
DROP COLUMN "repartidor_id",
DROP COLUMN "fecha",
DROP COLUMN "vuelta",
DROP COLUMN "dte_estado",
DROP COLUMN "dte_folio",
DROP COLUMN "dte_ambiente",
DROP COLUMN "dte_token",
DROP COLUMN "dte_intentos",
DROP COLUMN "dte_error",
DROP COLUMN "dte_pdf_path",
DROP COLUMN "dte_xml_path",
DROP COLUMN "dte_emitida_en",
DROP COLUMN "dte_emitida_por_id",
DROP COLUMN "dte_anulada_en",
DROP COLUMN "dte_anulada_por_id";
CREATE INDEX "guias_despacho_id_idx" ON "guias"("despacho_id");

ALTER TABLE "facturas_mensuales" DROP COLUMN "kg",
DROP COLUMN "monto_guias",
DROP COLUMN "dte_estado",
DROP COLUMN "dte_folio",
DROP COLUMN "dte_ambiente",
DROP COLUMN "dte_token",
DROP COLUMN "dte_intentos",
DROP COLUMN "dte_error",
DROP COLUMN "dte_pdf_path",
DROP COLUMN "dte_xml_path",
DROP COLUMN "dte_emitida_en",
DROP COLUMN "dte_emitida_por_id";

ALTER TABLE "notas_credito" DROP COLUMN "neto",
DROP COLUMN "iva",
DROP COLUMN "total",
DROP COLUMN "dte_estado",
DROP COLUMN "dte_folio",
DROP COLUMN "dte_ambiente",
DROP COLUMN "dte_token",
DROP COLUMN "dte_intentos",
DROP COLUMN "dte_error",
DROP COLUMN "dte_pdf_path",
DROP COLUMN "dte_xml_path",
DROP COLUMN "dte_emitida_en",
DROP COLUMN "dte_emitida_por_id";

ALTER TABLE "despachos" DROP COLUMN "monto";
ALTER TABLE "facturas_detalle" DROP COLUMN "subtotal";
ALTER TABLE "importaciones_balanza" DROP COLUMN "total_monto";
ALTER TABLE "conteos_detalle" DROP COLUMN "diferencia";

-- 4. Código de mesonera como clave foránea a usuarios(codigo) -----------------------
-- Un código que no corresponde a ningún usuario se deja vacío (ventas y movimientos) antes de crear la restricción
UPDATE "ventas_balanza" v SET "codigo_mesonera" = NULL WHERE "codigo_mesonera" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "usuarios" u WHERE u."codigo" = v."codigo_mesonera");
UPDATE "movimientos_stock" m SET "codigo_mesonera" = NULL WHERE "codigo_mesonera" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "usuarios" u WHERE u."codigo" = m."codigo_mesonera");

ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_codigo_mesonera_fkey" FOREIGN KEY ("codigo_mesonera") REFERENCES "usuarios"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ventas_balanza" ADD CONSTRAINT "ventas_balanza_codigo_mesonera_fkey" FOREIGN KEY ("codigo_mesonera") REFERENCES "usuarios"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "resumen_mesoneras" ADD CONSTRAINT "resumen_mesoneras_codigo_mesonera_fkey" FOREIGN KEY ("codigo_mesonera") REFERENCES "usuarios"("codigo") ON DELETE RESTRICT ON UPDATE CASCADE;
