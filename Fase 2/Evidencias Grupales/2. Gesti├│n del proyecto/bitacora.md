# Bitácora del proyecto Patopan

## Sesión 08-10-2026

### Hecho
- **Excel reales de las balanzas** (parche `0017`, rama `feature/plu-cas`), probados y funcionando:
  - **PLUData:** 428 productos importados. Se omiten 59 posiciones vacías y el PLU 1 "PRODUCTO VARIO", que se trata como venta Misc. El tipo de PLU es 1 = kg y 2 = unidad. La categoría se deduce del nombre: 11 pan, 26 cecinas y 391 mercadería.
  - **ScannerMap:** 387 códigos de barras asignados por PLU; 5 códigos están compartidos entre dos productos.
  - Búsqueda por código de barras o escáner en Productos, Stock, Conteos y Facturas. La exportación genera `PLUData_Patopan.xlsx` y `ScannerMap_Patopan.xlsx` con el formato de CAS.
- **Documentación de arquitectura** actualizada a la estructura actual (parche `0018`).
- **Repositorio académico** (formato del profesor): plantilla con README formal (contexto, objetivos, alcance, tecnologías, metodología, estructura y estado de avance), carpetas Fase 2 y Fase 3 con Evidencias Grupales e Individuales, y copia de la documentación técnica.

### Pendiente
1. Unir los PRs pendientes a `main` y completar en el repositorio académico los roles, el docente, la sección y las capturas.
2. Formato real de exportación de ventas cuando se conecte un PC a las balanzas.
3. Asignar los códigos de mesonera en Admin > Usuarios.
4. Probar las guías en la impresora real y validar el cuadre contra días del cuaderno.
5. Mover a Terminado las tarjetas ya probadas en Trello.


## Sesión 05-10-2026

### Hecho
- **Balanzas:** modelo confirmado, CAS CN1-30P. Hoy no tienen inventario cargado ni PC conectado; se conectarán por cable de red. Informe en `docs/informe-balanzas.md`.
- **Decisión:** Patopan será el catálogo maestro de las balanzas.
- **Integración con las balanzas** (en Pruebas, parche `0015`, rama `feature/meson-balanzas`):
  - **Importar productos** desde el Excel de las balanzas eligiendo las columnas; crea o actualiza por PLU, con revisión previa. **Exportar productos** a Excel para cargarlos en las balanzas.
  - **Importar ventas** desde archivo (Excel/CSV) con asignación de columnas. Cada venta queda como producto, "Misc." o no reconocida. Revisión previa; descuenta stock con el código de mesonera.
  - **Cierre manual del día** desde el reporte X impreso, mientras no haya PC.
  - No se permiten dos cargas para el mismo día; anular una carga repone el stock.
  - **Reporte por mesonera** con el % de ventas "Misc." (alerta desde 10 %) y los productos más vendidos.
- Excel de ejemplo para probar: `ejemplo-productos-balanza.xlsx` y `ejemplo-ventas-balanza.xlsx`.

- **Patopan Métricas** (repositorio aparte `patopan-metricas`, http://localhost:8090): muestra el avance del equipo leyendo Trello en vivo (API key y token en `.env`, solo lectura, sin base de datos). Mismo stack y colores que Patopan.
  - **Resumen:** % terminado, historias por etapa y lista, avance por módulo y criterios de aceptación.
  - **Evolución** (parche `metricas-0002`): burn-up, flujo acumulado, ritmo semanal, tiempo por etapa y actividad reciente, reconstruidos con el historial de Trello (desde el 03-10).
  - Recomendación: mover cada tarjeta por cada lista a medida que se trabaja, para que los tiempos por etapa sean reales.

### Pendiente
1. Excel real de productos de las balanzas → importarlo y ajustar la detección de columnas si hace falta.
2. Formato real de importación/exportación del software de CAS, cuando se instale el PC.
3. Asignar los códigos V1–V4 a las mesoneras en Admin > Usuarios.
4. Probar las guías en la impresora real.


## Sesión 04-10-2026

### Hecho
- **Despacho – bloque 3** (en Pruebas, parches `0009` y `0010`, rama `feature/despacho-pagos-reportes`). Funcionando en local.
  - **Pagos y saldos:** en el Cuadre se anota lo que pagó cada cliente (columna "Pagó"; Enter avanza). Se muestra el saldo anterior y lo que queda debiendo. Un botón registra en bloque a los que pagaron exacto. Nueva pestaña **Saldos** con la deuda total, el saldo por cliente y su estado de cuenta (imprimible).
  - **Historial de despachos:** filtros por fechas, cliente, repartidor, vuelta y modalidad. Muestra las guías vigentes y anuladas y quién registró cada línea. Exporta a CSV.
  - **Promedios:** kg por mes y cliente, gráfico mensual, promedio mensual y diario. Se marca a quien varía un 30 % o más su promedio diario en el último mes. Exporta a CSV.
- **Auditoría** (en Pruebas, parche `0011`, rama `feature/auditoria-meson-catalogo`): vista `/admin/auditoria`.
  - Filtros por fecha (hora de Chile), usuario, acción y texto, y por tipo: cambios, errores o todo.
  - Paginación y exportación a CSV.
  - Detalle de cada cambio con tabla "antes / después".
- **Mesón – bloque 1** (en Pruebas, parche `0011`):
  - **Productos:** CRUD con PLU único igual al de la balanza, categoría, unidad, precio y stock mínimo. El stock no se edita a mano.
  - **Proveedores:** CRUD con RUT validado y único.
- **Mesón – bloque 2: facturas** (en Pruebas, parche `0012`, rama `feature/meson-facturas`):
  - Registro con proveedor, N°, fecha, líneas (producto, cantidad, costo neto), IVA 19 % automático o manual, y total.
  - Cada línea suma al stock en la misma transacción (movimiento `ENTRADA_FACTURA`). No se puede repetir el mismo proveedor + N°.
  - Anulación con motivo: revierte el stock con `ANULACION_FACTURA` sin borrar el historial.
  - Foto o PDF de hasta 10 MB, con el tipo validado por contenido, guardada en el volumen `uploads`. El archivo anterior se conserva.
  - Función única `registrarMovimiento` para todo cambio de stock (reutilizable para balanzas y ajustes).
- **Mesón – bloque 3: inventario** (en Pruebas, parche `0013`, rama `feature/meson-inventario`):
  - **Stock:** estado de cada producto (sin stock / bajo el mínimo / OK), cuánto falta para el mínimo y último movimiento. Exporta a CSV.
  - **Kardex por producto:** saldo inicial y final, entradas y salidas, origen (factura o conteo), usuario y motivo. No editable.
  - **Conteos físicos:** cada diferencia exige motivo (merma, vencimiento, pérdida, error u otro) y genera un ajuste en el kardex. Reporte de faltantes y sobrantes valorizados a precio de venta.
- **Gestión de usuarios** (en Pruebas, parche `0014`, rama `feature/admin-usuarios`): Admin > Usuarios.
  - Crear y editar usuarios (rol y código de mesonera), desactivar, restablecer contraseña y cerrar sesiones.
  - "Mi contraseña" disponible para todos.
  - Desactivar, cambiar el rol o cambiar la contraseña cierra las sesiones al instante (versión de token).
  - Siempre queda al menos un admin activo.
- Checklist para la visita a la panadería: `docs/checklist-balanzas.md`.
- **Balanzas:** son CAS tipificadoras (imeco.cl). Falta confirmar el modelo exacto, conseguir el Excel compartido y una foto del voucher. Hipótesis por verificar: se administran con el software CL-Works, que podría exportar ventas a archivo.
- La prueba en la impresora real queda pendiente (sin impresora disponible hoy).

### Decisiones del cliente
| Tema | Decisión |
|---|---|
| Registro de pagos | Desde el cuadre del día |
| Pagos parciales / fiado | Ocurren a veces → se lleva el saldo acumulado por cliente |
| Facturas | Costos netos por línea; IVA 19 % por defecto, editable |

### Reglas de saldo
- Saldo = lo despachado ya cobrable − lo pagado.
- Reparto y presencial se cobran el mismo día. "Pago día siguiente" se cobra en el siguiente día trabajado.
- Un pago por cliente y día. Puede ser mayor al del día (abono a deuda) o menor (queda debiendo). Monto 0 o vacío = no pagó.

### Pendiente
1. Aplicar y probar `0014`; abrir los PRs pendientes (0011 a 0014).
2. Balanzas (ver checklist): modelo exacto, Excel compartido y foto del voucher → importación de ventas, sincronización del catálogo y reporte por mesonera.
3. Probar la guía en la impresora real y validar el cuadre contra días reales del cuaderno.

## Sesión 03-10-2026

### Hecho
- **Trello** reorganizado desde cero: 32 historias de usuario por módulo (Transversal, Despacho, Mesón) con criterios de aceptación.
- **Base técnica** (Terminado): Angular 19 + NestJS 11 + Prisma 6 + PostgreSQL 16 + Nginx en Docker Compose. Login por rol (admin / meson / despachador), auditoría, logo con espiga de trigo. Repositorio: github.com/ortgvdev/patopan.
- **Despacho – bloque 1** (Terminado): CRUD de clientes, repartidores y precio del kg.
  - Precio general $2.000/kg. Excepciones: Suegra $1.700 con 1 kg de descuento diario; Amasandería $1.900; Laguna y Maritza $1.800.
- **Despacho – bloque 2** (en Pruebas): planilla diaria, guías y cuadre.
  - Planilla igual al cuaderno: 3 vueltas por día (Mañana, Tarde 1, Tarde 2); solo kg (sin cajas).
  - Una guía por cliente y vuelta, una por hoja carta, sin firmas. COPIA solo si se confirmó la impresión (N° naranja = sin imprimir, verde = impresa).
  - Descuento diario de Suegra: una sola vez al día, en la primera vuelta con pan.
  - Cuadre por repartidor: cobros del día + "pago día siguiente" del día trabajado anterior; presenciales aparte.

### Decisiones del cliente
| Tema | Decisión |
|---|---|
| Registro | Total de kg por cliente (no cajas); decimales solo como excepción |
| Vueltas | 3 columnas del cuaderno = 3 vueltas del día |
| Guía | Una por cliente y vuelta, hoja carta completa, sin firmas |
| Descuento Suegra | 1 kg una vez al día |
