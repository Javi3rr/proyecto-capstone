# Simulación de ventas de las balanzas (mesón)

Mientras no hay acceso a las balanzas CAS del mesón, esta herramienta genera las ventas que habrían exportado y las carga en Patopan **por la API normal del sistema**: los mismos conteos de inventario y la misma importación de ventas que se usan desde *Mesón → Ventas*. Así el stock, el kardex y los reportes por mesonera quedan como si la conexión con las balanzas existiera.

Las cargas quedan en el sistema igual que una importación real (sin marca). Este README es el registro de que esas ventas se **generaron con esta herramienta** a partir de los datos de operación de la panadería.

## Qué genera

**Un archivo por día**, `salida/Ventas_PATO_PAN_dd-mm-aaaa.xlsx` (hoja `Ventas`). Tiene una fila por línea de ticket, como la exportaría el software de las balanzas:

| Fecha | Hora | Balanza | Ticket | Clerk | PLU No | Nombre | Cantidad | Precio unitario | Total |
|---|---|---|---|---|---|---|---|---|---|
| 02-11-2026 | 07:13:47 | B1 | 8409 | 1 | 1 | PAN | 1.355 | 2000 | 2710 |

Los títulos coinciden con los que reconoce la pantalla de importación, así que las columnas se asignan solas. Al final va una fila `TOTAL`, que la importación omite.

**En Patopan**, en orden cronológico:
1. **Inventario inicial:** un conteo la noche anterior al período, calculado para que ningún producto termine en 0 ni en negativo.
2. **Cada día:**
   - cada salida del horno (pan; la primera incluye la pastelería), registrada como conteo con motivo *"Pan horneado"*, porque el sistema no tiene un registro de producción;
   - la importación del archivo de ventas al cierre.
3. **`salida/ajustar-fechas.sql`:** deja cada conteo, carga y movimiento del kardex con su fecha y hora.

## Modelo

| Aspecto | Valor | Origen |
|---|---|---|
| Jornada de lunes a sábado | 07:00–20:15. Pan de la mañana: ~150 kg, sale a las 06:30 y se vende hasta las 13:30. Pan de la tarde: ~200 kg (la once), sale a las 13:30. Carga del día a las 20:45. | Panadería (hora de salida de la mañana: supuesto) |
| Jornada del domingo | Medio día, 07:00–14:30. Pan de las 07:00: ~150 kg. Pan de las 12:30: ~120 kg. Carga a las 14:45. | Panadería |
| Venta del día | Lunes a sábado promedian **$1.600.000** (viernes y sábado más; lunes y martes menos). Domingo **$1.200.000**. Variación de ±3 %. | Panadería |
| Cómo se llega al monto | El pan lo fijan las horneadas (se vende el 93–98 % de lo disponible). El resto se ajusta con cuánta pastelería, cecinas, huevos y mercadería lleva cada ticket. | Supuesto |
| Pan al peso | PLU 1 (82 %), PLU 2 (10 %), PLU 4 (8 %); compras de 0,15 a 4 kg, en múltiplos de 5 g (división de la balanza) | Supuesto |
| Horas peak | 07:30–09:30 y 17:30–19:45; el domingo, 08:00–10:30 y 12:30–13:30 | Supuesto |
| Mesoneras | Códigos 1–4 (V1–V4) en turnos de mañana y tarde (cambio a las 14:00), que rotan el sábado; el domingo, un solo turno de dos mesoneras. 2 balanzas. | Supuesto |
| Ventas "Misc. Por Conteo" | 3,5–5,5 % de los tickets, **parecido para todas** (ninguna mesonera con comportamiento anómalo) | Informe de balanzas |
| Ticket | Correlativo compartido por todas las balanzas, con ~1 % de saltos (tickets anulados) | Informe de balanzas |
| Productos y precios | Catálogo real de Patopan (los mismos PLU que tendrían las balanzas) | Base de datos |

Con la misma `--semilla` se obtienen exactamente los mismos datos.

## Uso

Con el sistema levantado (`docker compose up -d`):

```bash
cd herramientas/simulacion-balanzas
npm install

# Solo generar los archivos (para revisarlos o importarlos a mano desde la pantalla)
node simular-ventas.js --desde 2026-11-01 --hasta 2026-11-07 --solo-archivos

# Generar y cargar en Patopan (usuario meson; la clave se toma de MESON_CLAVE)
node simular-ventas.js --desde 2026-11-01 --hasta 2026-11-07

# Aplicar las fechas y horas de cada conteo y carga
docker compose exec -T db psql -U patopan -d patopan < salida/ajustar-fechas.sql
```

Opciones: `--semilla N` (por defecto 20261101), `--api URL`, `--usuario U` y `--salida DIR`.

La importación no acepta dos cargas para el mismo día. Para repetir un período, primero hay que anular sus cargas en *Mesón → Ventas*, o restaurar un respaldo de la base de datos.

## Carga realizada (08-11-2026)

Período: **01-11 al 07-11-2026** (el domingo 01-11 fue medio día), con la semilla 20261101.
- Ventas: **$10.792.862** en total. Lunes a sábado promediaron **$1.599.415** y el domingo **$1.196.370**. Unos 390 tickets por día de semana y 300 el domingo. "Misc.": 1,8 % del monto.
- Registros: conteo N° 1 (inventario inicial), conteos N° 2–15 (salidas del horno) y cargas de ventas N° 2–8.
- Al cierre, ningún producto queda en 0 ni en negativo.
