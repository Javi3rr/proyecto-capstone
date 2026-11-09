# Simulación de ventas de las balanzas (mesón)

Mientras no hay acceso a las balanzas CAS del mesón, esta herramienta genera las ventas que habrían exportado y las carga en Patopan **por la API normal del sistema**: los mismos conteos de inventario y la misma importación de ventas que se usan desde *Mesón → Ventas*. Así el stock, el kardex y los reportes por mesonera quedan como si la conexión con las balanzas existiera.

> **Son datos simulados.** Cada carga queda marcada con la observación *"Datos simulados: archivo generado sin acceso a las balanzas reales"*. No se deben presentar como ventas reales.

## Qué genera

**Un archivo por día**, `salida/Ventas_PATO_PAN_dd-mm-aaaa.xlsx` (hoja `Ventas`). Tiene una fila por línea de ticket, como la exportaría el software de las balanzas:

| Fecha | Hora | Balanza | Ticket | Clerk | PLU No | Nombre | Cantidad | Precio unitario | Total |
|---|---|---|---|---|---|---|---|---|---|
| 02-11-2026 | 07:13:47 | B1 | 8409 | 1 | 1 | PAN | 1.355 | 2000 | 2710 |

Los títulos coinciden con los que reconoce la pantalla de importación, así que las columnas se asignan solas. Al final va una fila `TOTAL`, que la importación omite.

**En Patopan**, en orden cronológico:
1. **Inventario inicial:** un conteo la noche anterior al período, calculado para que ningún producto termine en 0 ni en negativo.
2. **Cada día:**
   - salida del horno de la mañana (06:30): pan y pastelería;
   - salida del horno de la tarde (13:30): pan;
   - importación del archivo de ventas (20:45).

   Las salidas del horno se registran como conteos con motivo *"Pan horneado"*, porque el sistema no tiene un registro de producción.
3. **`salida/ajustar-fechas.sql`:** deja cada conteo, carga y movimiento del kardex con su fecha y hora simuladas.

## Modelo (y sus supuestos)

| Aspecto | Valor | Origen |
|---|---|---|
| Pan de la mañana | ~150 kg al día, que se venden hasta las 13:30 | Dato de la panadería |
| Pan de la tarde | 60 % de la mañana (menos en feriados), que se vende hasta las 20:15 | **Supuesto** |
| Pan vendido | 93–98 % de lo disponible; el resto pasa al período siguiente | Supuesto |
| Pan al peso | PLU 1 (82 %), PLU 2 (10 %), PLU 4 (8 %); compras de 0,15 a 4 kg, en múltiplos de 5 g (división de la balanza) | Supuesto |
| Horario de clientes | 07:00–20:15, con horas peak 07:30–09:30 y 17:30–19:45 | Supuesto |
| Día de la semana | Sábado y domingo +5 %; lunes a jueves −2 a −3 % | Supuesto |
| Mesoneras | Códigos 1–4 (V1–V4) en turnos de mañana y tarde (cambio a las 14:00), que rotan el fin de semana; 2 balanzas | Supuesto |
| Ventas "Misc. Por Conteo" | 3,5–5,5 % de los tickets, **parecido para todas** (no se simula a ninguna con comportamiento anómalo) | Informe de balanzas |
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

# Aplicar las fechas y horas simuladas
docker compose exec -T db psql -U patopan -d patopan < salida/ajustar-fechas.sql
```

Opciones: `--semilla N` (por defecto 20261101), `--api URL`, `--usuario U` y `--salida DIR`.

La importación no acepta dos cargas para el mismo día. Para repetir un período, primero hay que anular sus cargas en *Mesón → Ventas*, o restaurar un respaldo de la base de datos.

## Carga realizada (08-11-2026)

Período: **01-11 al 07-11-2026**, con la semilla 20261101.
- Ventas: **$6.971.011** en 7 días, unos 270 tickets diarios. "Misc.": 2,2 % del monto.
- Al cierre, ningún producto queda en 0 ni en negativo. El pan cierra con ~5 kg de sobrante y la pastelería con 3–6 unidades por producto.
