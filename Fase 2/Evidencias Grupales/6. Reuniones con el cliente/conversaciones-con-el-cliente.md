# Conversaciones con el cliente: necesidades y feedback continuo

Este documento muestra cómo trabajamos con el cliente, la Panadería Patopan, durante el desarrollo. En cada sesión el cliente planteó una necesidad o revisó lo que le mostramos, nosotros la llevamos al sistema y en la sesión siguiente volvimos a validar con él.

> **Cómo se construyó este documento.** No grabamos las reuniones ni levantamos actas formales: fueron conversaciones de trabajo en la panadería. Los diálogos que siguen están **reconstruidos** a partir de lo registrado en la [bitácora](../2.%20Gestión%20del%20proyecto/bitacora.md), en las [decisiones del cliente](decisiones-del-cliente.md) y en las tarjetas de Trello. Las fechas, las necesidades y las decisiones son las registradas; la redacción de las frases es nuestra y no es una cita textual.

**Participantes:** **Cliente**, el dueño de la panadería, y **Equipo**, los integrantes del proyecto Patopan.

---

## Sesión 1 · 03-10-2026 · Levantamiento del despacho

**Contexto:** primera sesión con el cuaderno de despacho sobre la mesa. El objetivo era entender cómo se registra hoy el reparto.

> **Cliente:** Todo el reparto se anota en este cuaderno. Cada cliente tiene su fila y hay tres columnas: la vuelta de la mañana y dos en la tarde.
>
> **Equipo:** ¿Anotan cajas o kilos?
>
> **Cliente:** Kilos, el total por cliente. A veces sale con decimales, pero es la excepción.
>
> **Equipo:** ¿Qué respaldo recibe hoy el cliente de lo que se le entregó?
>
> **Cliente:** Ninguno, y ahí se nos pierde plata. Necesito que cada cliente reciba una guía con sus kilos, una por cada vuelta.
>
> **Equipo:** ¿Una hoja por guía? ¿Lleva firma?
>
> **Cliente:** Una hoja carta completa por guía, sin firmas.
>
> **Cliente:** Otra cosa: no todos pagan lo mismo. El general es $2.000 el kilo, pero algunos tienen precio especial, y a uno le descuento 1 kilo al día.
>
> **Equipo:** ¿El descuento es por vuelta o por día?
>
> **Cliente:** Una sola vez al día.

**Qué integramos:**

| Necesidad del cliente | Funcionalidad |
|---|---|
| Registrar como en el cuaderno | Planilla diaria con las 3 vueltas (Mañana, Tarde 1 y Tarde 2), en kg por cliente |
| Respaldo para cada cliente | Una guía por cliente y vuelta, en hoja carta, sin firmas |
| Precios distintos por cliente | Precio general del kg y precio especial por cliente |
| Descuento diario | Campo "kg de descuento diario", aplicado una sola vez al día en la primera vuelta con pan |

---

## Sesión 2 · 04-10-2026 · Pagos, facturas de proveedores y mesón

**Contexto:** revisamos la planilla y el cuadre construidos el día anterior, y abrimos el tema del mesón.

> **Equipo:** Ya está la planilla. ¿Cómo registran hoy los pagos de cada cliente?
>
> **Cliente:** Al cuadrar el día. La mayoría paga completo, pero a veces alguien paga una parte y queda debiendo.
>
> **Equipo:** Entonces llevamos un saldo acumulado por cliente.
>
> **Cliente:** Sí. Y en el mesón, cuando llega mercadería, la factura del proveedor viene con costos netos.
>
> **Equipo:** ¿El IVA siempre es el 19 %?
>
> **Cliente:** Casi siempre, pero a veces hay que corregirlo a mano.
>
> **Cliente:** En el mesón también se pierde plata, el robo hormiga. Las mesoneras venden con las balanzas, pero no sabemos qué hay en stock.
>
> **Equipo:** Necesitamos ver las balanzas: el modelo y qué archivos exportan.

**Qué integramos:**

| Necesidad del cliente | Funcionalidad |
|---|---|
| Pagos parciales | Saldo acumulado por cliente y estado de cuenta *(simplificado en la sesión 4)* |
| Facturas de mercadería | Registro de facturas con costos netos, IVA 19 % editable y foto o PDF obligatorio; cada línea suma stock |
| Saber qué hay en el mesón | Productos, stock, historial por producto (kardex) y conteos físicos con motivo para cada diferencia |
| Saber quién hizo cada cambio | Auditoría de acciones y usuarios por rol |

---

## Sesión 3 · 05-10-2026 · Las balanzas del mesón

**Contexto:** visita a la panadería con una lista de verificación para las balanzas.

> **Equipo:** Las balanzas son CAS CN1-30P. Hoy no tienen productos cargados ni un PC conectado, ¿cierto?
>
> **Cliente:** Así es. Al final del día imprimen un reporte con las ventas.
>
> **Equipo:** Proponemos que el sistema sea el catálogo maestro: los productos se mantienen en Patopan y se exportan a las balanzas.
>
> **Cliente:** Me parece. Y quiero saber cuánto vende cada mesonera.
>
> **Equipo:** Hay una tecla, "PRODUCTO VARIO", que cobra un precio digitado sin producto. Ahí no se descuenta stock.
>
> **Cliente:** Justamente ahí se puede esconder algo. Quiero verlo por mesonera.

**Qué integramos:**

| Necesidad del cliente | Funcionalidad |
|---|---|
| Un solo catálogo | Importar y exportar productos en el formato de las balanzas CAS (PLUData y ScannerMap) |
| Ventas sin PC conectado | Cierre manual del día a partir del reporte impreso |
| Ventas por mesonera | Importación de ventas y reporte por mesonera con el % de ventas "Misc." (alerta desde el 10 %) |

---

## Sesión 4 · 08-10-2026 · Revisión del cuadre: menos pantallas, más simple

**Contexto:** el cliente probó el Cuadre y los Saldos construidos en la sesión 2. Esta revisión cambió el diseño.

> **Cliente:** Es mucho anotar lo que paga cada cliente todos los días. En la práctica casi todos pagan.
>
> **Equipo:** ¿Entonces anotamos solo a los que no pagan?
>
> **Cliente:** Eso. Y lo que no pagó, que se le cobre la próxima vez que reciba pan.
>
> **Equipo:** Al final del día, ¿qué necesita ver?
>
> **Cliente:** Cuánto me tiene que entregar cada repartidor. Lo del reparto lo rinde quien repartió, y lo de "pago día siguiente" lo cobra el repartidor asignado a ese cliente.
>
> **Equipo:** ¿Y los días que reparte uno solo?
>
> **Cliente:** Ese día cobra él todo. Ah, y a cada repartidor le pago $20.000 al día, que se descuenta de lo que entrega.

**Qué integramos:**

| Necesidad del cliente | Funcionalidad |
|---|---|
| Menos registro | Cuadre y Saldos reemplazados por una sola pantalla: **Entrega del día** |
| Registrar solo las excepciones | Botón **No pagó**: el monto pasa al próximo día con pan |
| Quién rinde | Cobrador por cliente y "¿Quién repartió hoy?" para días con un solo repartidor |
| Paga del repartidor | Paga habitual de $20.000, editable por día: *Debe entregar = cobrado − paga* |

> **Feedback aplicado:** el diseño de la sesión 2 (registrar cada pago) se simplificó por pedido del cliente. Sin esta revisión temprana habríamos seguido con una pantalla que no se iba a usar.

---

## Sesión 5 · 02-11-2026 · Facturación mensual

> **Cliente:** Los clientes me piden factura a fin de mes. Hoy la hago sumando las guías a mano.
>
> **Equipo:** ¿Para todos los clientes o solo para algunos?
>
> **Cliente:** Para todos, con referencia a las guías del mes.
>
> **Equipo:** El plazo legal es hasta el día 10 del mes siguiente. Lo mostramos en la pantalla.

**Qué integramos:** facturación mensual (DTE 33) con las guías del mes agrupadas por precio del kg, IVA y total calculados, referencia a cada guía y aviso del plazo del día 10. Cada guía queda ligada a su factura para que no se cobre dos veces.

---

## Sesión 6 · 04-11-2026 · Nueva resolución del SII para las guías

**Contexto:** la Resolución SII 144/2026, vigente desde el 01-11-2026, exige más datos en las guías de despacho.

> **Equipo:** El SII ahora distingue entre una guía de venta por cliente y una guía general del viaje, de "ventas por efectuar". ¿Cuál le acomoda?
>
> **Cliente:** Una guía de venta por cliente, como la que ya imprimimos.
>
> **Equipo:** También pide el RUT del transportista. ¿Los furgones son de la panadería?
>
> **Cliente:** Sí, son nuestros.
>
> **Equipo:** Entonces el transportista es la misma empresa.

**Qué integramos:** guía electrónica (DTE 52) por cliente y vuelta, con los datos del traslado: chofer, patente, RUT del transportista (el de Patopan), destino y fechas de salida y llegada.

---

## Sesión 7 · 15-11-2026 · Enviar al SII antes de salir

> **Equipo:** La guía tiene que estar en el SII antes de que salga el reparto. Proponemos enviarla al imprimir la vuelta. ¿Qué hacemos si el SII la rechaza?
>
> **Cliente:** El repartidor no puede quedarse esperando. Que se imprima igual, pero que se note.
>
> **Equipo:** Se imprime marcada "SIN FOLIO SII", con el motivo y un botón para reintentar.
>
> **Cliente:** Y que el repartidor lleve solo el PDF timbrado, no dos papeles.

**Qué integramos:** envío al SII al imprimir la vuelta; un solo PDF timbrado por vuelta y, si hay rechazo, la guía interna con la franja "SIN FOLIO SII" y el botón Reintentar.

---

## Resumen: del feedback al sistema

| Sesión | Lo que pidió o corrigió el cliente | Dónde quedó en el sistema |
|---|---|---|
| 1 · 03-10 | Registrar como el cuaderno; guía por cliente | Planilla de 3 vueltas · guías |
| 2 · 04-10 | Pagos parciales; facturas de proveedores; robo hormiga | Saldos *(luego simplificado)* · facturas · stock y kardex |
| 3 · 05-10 | Catálogo único; ventas por mesonera | Importación y exportación de balanzas · reporte "Misc." |
| 4 · 08-10 | **Simplificar**: solo excepciones de pago | Entrega del día · No pagó · paga del repartidor |
| 5 · 02-11 | Factura mensual para todos | Facturación mensual (DTE 33) |
| 6 · 04-11 | Guía de venta por cliente; furgones propios | Guía electrónica con datos del traslado |
| 7 · 15-11 | No detener el reparto si el SII falla | "SIN FOLIO SII" y Reintentar · PDF timbrado |

Cada iteración fue de una semana: lo que el cliente pidió en una sesión se mostró funcionando en la siguiente, y su revisión ajustó lo que venía. El caso más claro es la sesión 4, donde el cliente cambió el diseño de los pagos antes de que el sistema llegara a usarse.
