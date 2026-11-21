# Informe técnico: balanzas CAS (spike de integración)

> Historia: **[MESÓN] Investigar el modelo y formato de exportación de las balanzas etiquetadoras**
> Estado: en curso (05-10-2026). Falta el Excel de productos para cerrar la decisión.

## 1. Equipo
| Dato | Valor (placa trasera) |
|---|---|
| Marca / modelo | **CAS CN1-30P** (balanza con impresora de tickets y etiquetas, columna con pantalla a color) |
| Capacidad | 15/30 kg, mínimo 100 g, división 5/10 g |
| Fabricación | 12-2025, n° de serie 251250136 |

Según la ficha del fabricante y sus distribuidores, la serie CN1 tiene:
- **LAN (Ethernet)** para trabajar en red con otras balanzas; **Wi-Fi** opcional (la pantalla muestra el ícono y la palabra "MASTER", lo que sugiere que esta balanza es la principal de una red).
- **USB** para lector de código de barras, teclado o pendrive.
- **RS-232C** para PC o impresora externa.
- Hasta **10.000 PLU** y **72 teclas de PLU** programables; es compatible con la serie CL de CAS, que se administra desde PC con el software **CL-Works**.

## 2. Lo que muestran los vouchers
| Campo del voucher | Ejemplo | Uso en Patopan |
|---|---|---|
| Encabezado | `PATO PAN` | — |
| `CLERK(n)` | 1, 3, 4 | **Código de mesonera** (teclas V1–V4 de la balanza) → se carga en Admin > Usuarios |
| Fecha y hora | `05-10-2026 18:52` | Fecha de la venta |
| Líneas | `HUEVO 6 x 300 = 1800` | Producto (solo **nombre**, sin PLU), cantidad o kg, precio unitario, total |
| `Misc. Por Conteo` | `1 x 2000` | Venta **sin producto** (precio digitado a mano) → no se puede descontar de stock |
| Subtotal / Total | `3 Articulos · 11400` | Cuadre con la caja |
| `NO:` | 00136, 00137, 00139 | Correlativo **único para todas las mesoneras** (saltos = tickets anulados o no entregados) |
| Código QR | — | Por verificar qué contiene (escanearlo con el celular) |

## 3. Hallazgos importantes para el negocio
1. **Ventas "Misc. Por Conteo":** se venden productos sin usar su tecla/PLU. Esas ventas no descuentan stock ni dicen qué se vendió. Es un punto ciego para el robo hormiga → conviene **medir cuántas hay por mesonera**.
2. **El voucher no trae el PLU**, solo el nombre. Para cruzar ventas con productos se debe usar el PLU que entrega la balanza en sus reportes/exportación, o el nombre exacto.
3. **Correlativo compartido:** permite detectar tickets faltantes.
4. El teclado tiene teclas rotuladas a mano para pan, empanada, huevo, berlín, donas, cecinas y quesos, y **V1–V4** para las 4 mesoneras.

## 3b. Situación actual (confirmado 05-10-2026)
- Las balanzas **aún no tienen el inventario cargado** y **no hay PC** conectado a ellas en el mesón.
- Se pueden conectar **por cable de red**, que es la vía para el inventario y para el intercambio con Excel.
- El QR del voucher **no es relevante** por ahora.

**Consecuencia:** como las balanzas parten sin inventario, **Patopan puede ser el catálogo maestro**. Los productos y PLU se crean en Patopan y se exportan en el formato que acepta el software de CAS para cargarlos a las balanzas por la red. Así los PLU coinciden desde el primer día, y luego las ventas se exportan desde ese software y se importan a Patopan.

## 3c. Formato real de los archivos (recibidos 08-10-2026)

**PLUData_Pato_Pan.xlsx** (hoja "PLU Data", 488 filas, 23 columnas):

| Columna | Uso en Patopan |
|---|---|
| `PLU No` | PLU del producto (igual a `Código del objeto`) |
| `Nombre1` | Nombre |
| `Tipo de PLU` | 1 = por peso (kg) · 2 = por unidad |
| `Precio unitario` | Precio de venta ($/kg o $/unidad) |
| `Departamento no` | Siempre 1 (no se usa) |
| Category, Grupo, Etiqueta, Origen, Peso fijo, Código de barras no, Precio especial | Siempre 0 (no se usan) |

- **428 productos válidos**. Por categoría (automática): 11 de pan, 26 cecinas al peso y 391 de mercadería.
- **59 PLU sin usar** (40–98 y 486, sin nombre ni precio) → se omiten.
- **PLU 1 "PRODUCTO VARIO"** = tecla de precio libre → no es producto; sus ventas cuentan como "Misc.".
- **Nombres repetidos con distinto PLU** (MILKA, JUGO SPRIM, ZUKO HUESILLO) → las ventas se cruzan por PLU.

**ScannerMap_PATO_PAN_19-08.xlsx** (hoja "ScannerMap", 486 filas): `Código` = PLU, `Código de mapeo` = código de barras (EAN-13/8/UPC) en 387 productos. En el resto el código es igual al PLU (sin código de barras). Hay 5 códigos de barras compartidos por dos productos.

**Decisión:** Patopan importa ambos archivos y exporta el catálogo con **las mismas columnas**, para cargarlo de vuelta en el software de CAS.

## 4. Opciones de integración
| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A. Software CAS en PC (CL-Works) por red** | La balanza se conecta por LAN/Wi-Fi a un PC con el software de CAS; se exportan PLU y ventas a Excel/CSV y se suben a Patopan | Datos completos (PLU, cantidades, mesonera) | Requiere PC en la red y el software; formato por confirmar |
| **B. Pendrive (USB)** | Respaldo/exportación de datos de la balanza al pendrive | No requiere PC en la red | Formato puede ser propietario; por confirmar en el menú |
| **C. Reporte de cierre impreso (X/Z)** | Al cerrar el día se imprime el reporte por PLU y por mesonera, y se digita el resumen en Patopan | Funciona hoy, sin conexión | Digitación manual; menos detalle |
| **D. QR del voucher** | Leer el QR de cada ticket con cámara | Detalle por ticket | Depende de qué contenga; un ticket a la vez |

**Decisión propuesta:**
1. **Patopan como catálogo maestro.** Exportar productos (PLU, nombre, precio, unidad) a Excel/CSV para cargarlos en las balanzas mediante el software de CAS conectado por red.
2. **Importar ventas** desde el archivo que exporte ese software, asignando las columnas (PLU, cantidad, monto, mesonera, fecha). Cada venta descuenta stock con `SALIDA_VENTA`.
3. **Mientras no haya PC ni exportación:** pantalla de cierre de ventas del día, digitada desde el reporte X de la balanza.

**Recomendación anterior:** diseñar la importación en Patopan **independiente del formato** (subir archivo y asignar columnas: PLU o nombre, cantidad, monto, mesonera, fecha). Mientras no exista exportación, usar la **opción C** con una pantalla de "Cierre de ventas del día". Así el sistema funciona ya y queda listo para la opción A o B.

## 5. Pendiente por confirmar en la panadería
- [ ] Excel compartido de productos (columnas y PLU).
- [x] No hay PC conectado; se conectarán por cable de red. Falta saber cuántas balanzas son.
- [ ] Pedir a Imeco (o a CAS) el software de PC para la CN1 y el **formato de importación de PLU** y de **exportación de ventas**.
- [ ] En el **MENU** de la balanza: opciones de **Reportes** (X/Z, por PLU, por vendedor) y de **USB/respaldo**. Foto de esas pantallas.
- [ ] Imprimir un **reporte de cierre** (X, sin borrar) y fotografiarlo.
- [ ] Nombres de las mesoneras V1–V4.

## Fuentes
- Placa del equipo y vouchers fotografiados en el local (05-10-2026).
- Ficha CAS CN1 (Directshopfittings): https://www.directshopfittings.co.uk/cas-cn1-label-printing-weighing-scales-15kg/
- Distribuidor en español (Laser Print Soluciones): https://www.laserprintsoluciones.com/producto/balanza-etiquetadora-cas-cn1-30p/
