-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'MESON', 'DESPACHO');

-- CreateEnum
CREATE TYPE "ModalidadCliente" AS ENUM ('REPARTO', 'PAGO_DIA_SIGUIENTE', 'PRESENCIAL');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('VIGENTE', 'ANULADA');

-- CreateEnum
CREATE TYPE "CategoriaProducto" AS ENUM ('PAN', 'CECINAS', 'MERCADERIA');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('KG', 'UNIDAD');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA_FACTURA', 'ANULACION_FACTURA', 'SALIDA_VENTA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "codigo" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" INTEGER,
    "accion" VARCHAR(30) NOT NULL,
    "recurso" VARCHAR(255) NOT NULL,
    "estado_http" INTEGER,
    "detalle" JSONB,
    "ip" VARCHAR(64),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repartidores" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "rut" VARCHAR(12),
    "patente" VARCHAR(10),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repartidores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "direccion" VARCHAR(200),
    "telefono" VARCHAR(20),
    "modalidad" "ModalidadCliente" NOT NULL,
    "repartidor_id" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "precio_kg_especial" DECIMAL(10,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_kg" (
    "id" SERIAL NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precios_kg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornadas_despacho" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "cerrada" BOOLEAN NOT NULL DEFAULT false,
    "cerrada_en" TIMESTAMP(3),
    "cerrada_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornadas_despacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despachos" (
    "id" SERIAL NOT NULL,
    "jornada_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "repartidor_id" INTEGER,
    "kg" DECIMAL(10,3) NOT NULL,
    "cajas" INTEGER NOT NULL DEFAULT 1,
    "precio_kg" DECIMAL(10,2) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despachos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guias" (
    "id" SERIAL NOT NULL,
    "despacho_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "repartidor_id" INTEGER,
    "fecha" DATE NOT NULL,
    "kg" DECIMAL(10,3) NOT NULL,
    "precio_kg" DECIMAL(10,2) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VIGENTE',
    "motivo_anulacion" VARCHAR(255),
    "anulada_por_id" INTEGER,
    "anulada_en" TIMESTAMP(3),
    "impresiones" INTEGER NOT NULL DEFAULT 0,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "guia_id" INTEGER,
    "repartidor_id" INTEGER,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "plu" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "categoria" "CategoriaProducto" NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,
    "precio_venta" DECIMAL(10,2) NOT NULL,
    "stock_minimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stock_actual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "rut" VARCHAR(12) NOT NULL,
    "razon_social" VARCHAR(150) NOT NULL,
    "contacto" VARCHAR(120),
    "telefono" VARCHAR(20),
    "email" VARCHAR(120),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" SERIAL NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "fecha" DATE NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "archivo_path" VARCHAR(255),
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VIGENTE',
    "motivo_anulacion" VARCHAR(255),
    "creado_por_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas_detalle" (
    "id" SERIAL NOT NULL,
    "factura_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo_unitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "facturas_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_stock" (
    "id" BIGSERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "saldo_resultante" DECIMAL(12,3) NOT NULL,
    "origen_tipo" VARCHAR(30),
    "origen_id" INTEGER,
    "motivo" VARCHAR(255),
    "codigo_mesonera" VARCHAR(20),
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones_balanza" (
    "id" SERIAL NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "hash_archivo" VARCHAR(64) NOT NULL,
    "periodo_desde" TIMESTAMP(3) NOT NULL,
    "periodo_hasta" TIMESTAMP(3) NOT NULL,
    "filas" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_balanza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteos_inventario" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" VARCHAR(255),
    "usuario_id" INTEGER,

    CONSTRAINT "conteos_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteos_detalle" (
    "id" SERIAL NOT NULL,
    "conteo_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "stock_esperado" DECIMAL(12,3) NOT NULL,
    "stock_contado" DECIMAL(12,3) NOT NULL,
    "diferencia" DECIMAL(12,3) NOT NULL,
    "motivo" VARCHAR(255),

    CONSTRAINT "conteos_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_caja" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "total_caja" DECIMAL(12,2) NOT NULL,
    "usuario_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_codigo_key" ON "usuarios"("codigo");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_creado_en_idx" ON "auditoria"("usuario_id", "creado_en");

-- CreateIndex
CREATE INDEX "auditoria_creado_en_idx" ON "auditoria"("creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "repartidores_rut_key" ON "repartidores"("rut");

-- CreateIndex
CREATE INDEX "clientes_modalidad_orden_idx" ON "clientes"("modalidad", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_nombre_modalidad_key" ON "clientes"("nombre", "modalidad");

-- CreateIndex
CREATE INDEX "precios_kg_vigente_desde_idx" ON "precios_kg"("vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "jornadas_despacho_fecha_key" ON "jornadas_despacho"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "despachos_jornada_id_cliente_id_key" ON "despachos"("jornada_id", "cliente_id");

-- CreateIndex
CREATE INDEX "guias_cliente_id_fecha_idx" ON "guias"("cliente_id", "fecha");

-- CreateIndex
CREATE INDEX "guias_fecha_idx" ON "guias"("fecha");

-- CreateIndex
CREATE INDEX "pagos_cliente_id_fecha_idx" ON "pagos"("cliente_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "productos_plu_key" ON "productos"("plu");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_rut_key" ON "proveedores"("rut");

-- CreateIndex
CREATE INDEX "facturas_fecha_idx" ON "facturas"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_proveedor_id_numero_key" ON "facturas"("proveedor_id", "numero");

-- CreateIndex
CREATE INDEX "movimientos_stock_producto_id_creado_en_idx" ON "movimientos_stock"("producto_id", "creado_en");

-- CreateIndex
CREATE INDEX "movimientos_stock_origen_tipo_origen_id_idx" ON "movimientos_stock"("origen_tipo", "origen_id");

-- CreateIndex
CREATE UNIQUE INDEX "importaciones_balanza_hash_archivo_key" ON "importaciones_balanza"("hash_archivo");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_fecha_key" ON "cierres_caja"("fecha");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornadas_despacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despachos" ADD CONSTRAINT "despachos_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_repartidor_id_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "repartidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_detalle" ADD CONSTRAINT "facturas_detalle_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas_detalle" ADD CONSTRAINT "facturas_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteos_detalle" ADD CONSTRAINT "conteos_detalle_conteo_id_fkey" FOREIGN KEY ("conteo_id") REFERENCES "conteos_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteos_detalle" ADD CONSTRAINT "conteos_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

