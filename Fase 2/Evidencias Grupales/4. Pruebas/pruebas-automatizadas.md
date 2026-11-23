# Pruebas automatizadas (Jest)

Pruebas unitarias del backend (`backend/src/**/*.spec.ts`). Cubren la lógica tributaria y las reglas que no dependen de la base de datos: cálculo de la factura mensual, armado de los documentos SII (guía 52, factura 33 y nota de crédito 61), datos del traslado de la Res. SII 144/2026, anulación y reemplazo de guías, y mensajes de error del proveedor.

Se ejecutan con `npm test` en `backend/` y en cada Pull Request con el pipeline de integración continua.

**Resultado al 21-11-2026:** Test Suites: 3 passed, 3 total · Tests: 42 passed, 42 total

### `src/facturacion/calculo.spec.ts`


**calcularFactura**

- ✅ con precio con IVA: desglosa el neto con el precio ÷ 1,19 y suma el 19 % de IVA
- ✅ agrupa por precio del kg (cambio de precio a mitad de mes) y descuenta los kg sin costo
- ✅ ordena las líneas por precio aunque las guías vengan desordenadas
- ✅ con precio neto: no divide por 1,19 y agrega el IVA encima
- ✅ nunca cobra kg negativos si el descuento supera lo despachado
- ✅ sin guías devuelve todo en cero
- ✅ suma kg con decimales sin errores de punto flotante

**plazoLegal**

- ✅ es el día 10 del mes siguiente
- ✅ en diciembre pasa al año siguiente

### `src/dte/dte.spec.ts`


**armarFactura33 (factura electrónica)**

- ✅ arma una factura tipo 33 con una línea por precio y los totales del cálculo
- ✅ referencia cada guía de despacho (DTE 52) por folio, en orden
- ✅ con más de 40 guías usa una sola referencia global (límite del SII)
- ✅ usa los datos tributarios del cliente como receptor
- ✅ fuera de producción, a un cliente sin RUT le pone el receptor de prueba
- ✅ en producción no permite facturar a un cliente sin RUT
- ✅ no permite una factura sin kg cobrados

**armarNotaCredito61 (nota de crédito que anula la factura)**

- ✅ es un DTE tipo 61 con fecha de hoy
- ✅ anula la factura: referencia su folio con CodRef 1 y el motivo
- ✅ repite el detalle, el receptor y los montos de la factura que anula
- ✅ recorta el motivo al largo máximo del SII (90 caracteres)

**armarGuia52 (guía de despacho electrónica)**

- ✅ cobra los kg menos el descuento al precio neto y desglosa el IVA
- ✅ un cliente presencial retira por su cuenta (TipoDespacho 1, sin transporte, Res. 144 resolutivo 15°)
- ✅ una guía normal no lleva referencias
- ✅ la guía que corrige a otra anulada referencia su folio (DTE 52), sin CodRef

**datos del traslado (Res. SII 144/2026)**

- ✅ informa chofer, patente, RUT del transportista (la empresa), destino y fechas de salida y llegada
- ✅ la hora de salida (opcional) solo se informa si se emite el mismo día del reparto
- ✅ normaliza la patente (sin guion ni espacios, en mayúscula)
- ✅ en producción no emite una guía de reparto si faltan datos del traslado
- ✅ fuera de producción la emite sin esos datos y deja un aviso
- ✅ una guía de reparto sin repartidor asignado también es un dato faltante

**mensajeDe (errores del proveedor)**

- ✅ traduce los campos observados a palabras simples
- ✅ sin forma conocida devuelve el texto de la respuesta

**nombreAmbiente**

- ✅ corresponde al dteAmbiente que se guarda en cada documento

### `src/guias/guias.service.spec.ts`


**GuiasService.anular**

- ✅ anula una guía interna (sin folio SII) sin pedir confirmación
- ✅ con folio SII exige confirmar que se anuló en el portal
- ✅ con folio SII y la confirmación, la anula y registra quién confirmó la anulación en el SII
- ✅ un folio del modo simulado no existe en el SII: no pide confirmación
- ✅ no anula una guía incluida en una factura mensual vigente
- ✅ no anula dos veces

**GuiasService.emitir (guía de una línea de la planilla)**

- ✅ la primera guía de la vuelta no reemplaza a ninguna
- ✅ después de anular para corregir los kg, la guía nueva reemplaza a la última anulada
- ✅ no crea otra guía si ya hay una vigente
