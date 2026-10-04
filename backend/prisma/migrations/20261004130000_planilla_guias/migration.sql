-- Se registra solo el total de kg por cliente y día (la cantidad de cajas no se usa)
ALTER TABLE "despachos" DROP COLUMN "cajas";

-- AlterTable: kg no cobrados en cada línea de la planilla
ALTER TABLE "despachos" ADD COLUMN "kg_descuento" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable: la guía guarda el descuento aplicado
ALTER TABLE "guias" ADD COLUMN "kg_descuento" DECIMAL(10,3) NOT NULL DEFAULT 0;
