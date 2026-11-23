# Pruebas funcionales

Pruebas del sistema completo (pantallas, base de datos y proveedor del SII) registradas en la bitácora. Los documentos SII se probaron en el **ambiente de pruebas de OpenFactura**, sin efecto tributario.

| Fecha | Historia | Prueba | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| 22-10-2026 | #47 Guía de despacho electrónica | Emitir guías del día en el SII | Folio, estado y PDF guardados | ✅ Guías aceptadas con folios 103663 y 103664; PDF timbrado guardado |
| 03-11-2026 | #48 Factura mensual | Generar y emitir la factura del mes de un cliente | Factura con IVA que referencia los folios de sus guías | ✅ Factura aceptada con folio 203777 |
| 03-11-2026 | #48 Nota de crédito | Anular una factura emitida | Nota de crédito (CodRef 1); la factura se anula solo si el SII la acepta | ✅ Factura 203777 anulada con la nota de crédito folio 116046 |
| 04-11-2026 | #49 Anulación de guías | Anular una guía con nota de crédito | El SII debe aceptarla | ❌ El proveedor la rechaza ("el tipo 52 no puede ser referenciado por un DTE 61") → se implementó la **anulación manual registrada** |
| 01–07-11-2026 | #39 / #44 Ventas de balanzas | Cargar una semana de ventas del mesón | Stock descontado y reporte por mesonera | ✅ 2.699 ventas ($10,8 millones), 0 productos sin stock, "Misc." 1,8 % |
| 15-11-2026 | #50 Res. SII 144/2026 | Enviar guías al SII al imprimir la vuelta sin datos del chofer | Rechazo con motivo claro y guía marcada | ✅ Rechazo "patente del furgón / RUT del chofer: campo requerido"; guía impresa con "SIN FOLIO SII" y botón Reintentar |
| 15-11-2026 | #50 Res. SII 144/2026 | Guía que reemplaza a una anulada | El SII acepta la referencia a la guía anulada | ✅ Guía aceptada con folio 104346 (referencia al folio 103664) |
| 15-11-2026 | #50 Res. SII 144/2026 | Unir los PDF timbrados de una vuelta | Un solo PDF, sin las guías anuladas | ✅ PDF de 4 hojas carta; la guía anulada quedó fuera |
| 17-11-2026 | CI | Pipeline en el PR #9 | Backend, frontend e imágenes Docker en verde | ✅ 59 s · 29 s · 1 min 52 s |

Detalle de cada sesión: [bitácora](../2.%20Gestión%20del%20proyecto/bitacora.md). Capturas de la impresión con y sin folio: [evidencias de trabajo](../../../Fase%203/Evidencias%20Grupales/5.%20Evidencias%20de%20trabajo/img/).
