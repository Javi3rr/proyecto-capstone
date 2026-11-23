-- Clientes presenciales: factura electrónica en cada retiro, en vez de la factura mensual
ALTER TABLE "facturas_mensuales" ADD COLUMN "inmediata" BOOLEAN NOT NULL DEFAULT false;
