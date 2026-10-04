-- AlterTable: kg que no se cobran cada día a un cliente (ej. Suegra: 1 kg diario)
ALTER TABLE "clientes" ADD COLUMN "kg_descuento_diario" DECIMAL(10,3) NOT NULL DEFAULT 0;
