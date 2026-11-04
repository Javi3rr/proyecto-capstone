-- Anulación en el SII de una guía de despacho electrónica ya emitida.
-- No se puede anular con nota de crédito (el SII no acepta un DTE 61 que referencie un DTE 52) ni por la API
-- del proveedor: se anula a mano en el portal, y el sistema registra quién confirmó haberlo hecho y cuándo.

ALTER TABLE "guias" ADD COLUMN "dte_anulada_en" TIMESTAMP(3);
ALTER TABLE "guias" ADD COLUMN "dte_anulada_por_id" INTEGER;
