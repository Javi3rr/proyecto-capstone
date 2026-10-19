-- Ventas de las balanzas: importación por archivo o cierre manual, líneas y resumen por mesonera

ALTER TYPE "TipoMovimiento" ADD VALUE IF NOT EXISTS 'ANULACION_VENTA';

CREATE TYPE "OrigenVentas" AS ENUM ('ARCHIVO', 'MANUAL');
CREATE TYPE "TipoLineaVenta" AS ENUM ('PRODUCTO', 'MISC', 'SIN_PRODUCTO');

ALTER TABLE "importaciones_balanza" ADD COLUMN "origen" "OrigenVentas" NOT NULL DEFAULT 'ARCHIVO';
ALTER TABLE "importaciones_balanza" ALTER COLUMN "nombre_archivo" DROP NOT NULL;
ALTER TABLE "importaciones_balanza" ALTER COLUMN "hash_archivo" DROP NOT NULL;
ALTER TABLE "importaciones_balanza" ALTER COLUMN "periodo_desde" TYPE DATE USING "periodo_desde"::date;
ALTER TABLE "importaciones_balanza" ALTER COLUMN "periodo_hasta" TYPE DATE USING "periodo_hasta"::date;
ALTER TABLE "importaciones_balanza" ADD COLUMN "total_monto" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "importaciones_balanza" ADD COLUMN "observacion" VARCHAR(255);
ALTER TABLE "importaciones_balanza" ADD COLUMN "estado" "EstadoDocumento" NOT NULL DEFAULT 'VIGENTE';
ALTER TABLE "importaciones_balanza" ADD COLUMN "motivo_anulacion" VARCHAR(255);
ALTER TABLE "importaciones_balanza" ADD COLUMN "anulada_por_id" INTEGER;
ALTER TABLE "importaciones_balanza" ADD COLUMN "anulada_en" TIMESTAMP(3);
CREATE INDEX "importaciones_balanza_periodo_desde_periodo_hasta_idx" ON "importaciones_balanza"("periodo_desde", "periodo_hasta");

CREATE TABLE "ventas_balanza" (
    "id" SERIAL NOT NULL,
    "importacion_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "codigo_mesonera" VARCHAR(20),
    "producto_id" INTEGER,
    "plu" VARCHAR(20),
    "descripcion" VARCHAR(150) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tipo" "TipoLineaVenta" NOT NULL,
    CONSTRAINT "ventas_balanza_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ventas_balanza_fecha_idx" ON "ventas_balanza"("fecha");
CREATE INDEX "ventas_balanza_producto_id_fecha_idx" ON "ventas_balanza"("producto_id", "fecha");
ALTER TABLE "ventas_balanza" ADD CONSTRAINT "ventas_balanza_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones_balanza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ventas_balanza" ADD CONSTRAINT "ventas_balanza_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "resumen_mesoneras" (
    "id" SERIAL NOT NULL,
    "importacion_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "codigo_mesonera" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "monto_misc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineas_misc" INTEGER NOT NULL DEFAULT 0,
    "tickets" INTEGER,
    CONSTRAINT "resumen_mesoneras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resumen_mesoneras_fecha_codigo_mesonera_idx" ON "resumen_mesoneras"("fecha", "codigo_mesonera");
ALTER TABLE "resumen_mesoneras" ADD CONSTRAINT "resumen_mesoneras_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones_balanza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
