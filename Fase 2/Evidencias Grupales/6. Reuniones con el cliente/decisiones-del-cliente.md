# Decisiones del cliente

Decisiones tomadas con la Panadería Patopan durante el desarrollo, tal como quedaron registradas en la [bitácora](../2.%20Gestión%20del%20proyecto/bitacora.md) y en las tarjetas de Trello. Cada una cambió el sistema en la iteración siguiente (ver la lámina "Feedback temprano" de la presentación).

| Fecha | Tema | Decisión | Efecto en el sistema |
|---|---|---|---|
| 03-10-2026 | Registro del reparto | Total de kg por cliente (no cajas); decimales solo como excepción | La planilla registra kg por cliente |
| 03-10-2026 | Vueltas | Las 3 columnas del cuaderno son las 3 vueltas del día | Planilla con Mañana, Tarde 1 y Tarde 2 |
| 03-10-2026 | Guía | Una por cliente y vuelta, hoja carta completa, sin firmas | Impresión de una guía por hoja |
| 03-10-2026 | Descuento de un cliente | 1 kg de descuento una vez al día | Campo "kg de descuento diario" por cliente |
| 04-10-2026 | Pagos | Pagos desde el cuadre del día; los pagos parciales ocurren a veces | Saldo acumulado por cliente |
| 04-10-2026 | Facturas de proveedores | Costos netos por línea; IVA 19 % por defecto, editable | Factura de mercadería con IVA editable |
| 08-10-2026 | Cuadre y saldos | Se reemplazan por una sola pantalla de entrega por repartidor | Pantalla **Entrega del día** |
| 08-10-2026 | Deudas | No se registran todos los pagos: solo las excepciones de "no pagó" | Botón **No pagó**; el monto pasa al siguiente día con pan |
| 08-10-2026 | Quién rinde | Lo del reparto, quien repartió ese día; lo de pago día siguiente, el cobrador del cliente | Cobrador por cliente en la Entrega del día |
| 02-11-2026 | Facturación | Factura mensual con referencia a las guías, para **todos** los clientes | Facturación mensual (DTE 33) |
| 04-11-2026 | Guías en el reparto | Una guía de venta por cliente, no una guía general del viaje | Una guía electrónica por cliente y vuelta |
| 04-11-2026 | Transportista | Los furgones son de la panadería: el RUT del transportista es el de la empresa | `RUTTrans` = RUT de Patopan |
| 15-11-2026 | Envío al SII | Si el envío falla, la guía se imprime igual con una alerta | Franja "SIN FOLIO SII" y botón Reintentar |
| 15-11-2026 | Qué lleva el repartidor | Solo el PDF timbrado del SII | Un PDF por vuelta con las guías timbradas |

> No se levantaron actas formales con asistentes y firmas: las reuniones fueron conversaciones de trabajo en la panadería y las decisiones se registraron en la bitácora y en Trello.
