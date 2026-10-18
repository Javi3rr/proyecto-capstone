-- Facturas: las líneas pueden ser de productos aún no registrados (sin movimiento de stock)
ALTER TABLE "facturas_detalle" ALTER COLUMN "producto_id" DROP NOT NULL;
ALTER TABLE "facturas_detalle" ADD COLUMN "descripcion" VARCHAR(150);
ALTER TABLE "facturas_detalle" DROP CONSTRAINT IF EXISTS "facturas_detalle_producto_id_fkey";
ALTER TABLE "facturas_detalle" ADD CONSTRAINT "facturas_detalle_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
