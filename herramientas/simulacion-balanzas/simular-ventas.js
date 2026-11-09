#!/usr/bin/env node
/**
 * Simulación de ventas de las balanzas CAS del mesón de Patopan.
 *
 * Mientras no hay acceso a las balanzas reales, genera para cada día el archivo de ventas que exportaría el
 * software de CAS (una fila por línea de ticket) y lo carga en Patopan por la API, igual que la pantalla
 * Mesón → Ventas → Importar. También registra el inventario inicial y cada salida del horno como conteos,
 * para que el stock y el kardex queden coherentes (ningún producto termina en 0 ni negativo).
 *
 * Uso (con el sistema levantado en Docker):
 *   npm install
 *   node simular-ventas.js --desde 2026-11-01 --hasta 2026-11-07            # genera y carga
 *   node simular-ventas.js --desde 2026-11-01 --hasta 2026-11-07 --solo-archivos
 * Opciones: --semilla N (misma semilla = mismos datos), --api URL, --usuario U (clave en MESON_CLAVE), --salida DIR
 *
 * Al final escribe salida/ajustar-fechas.sql, que deja cada conteo y carga con la fecha y hora simuladas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

// ------------------------------------------------------------------ Parámetros del modelo

/** Pan que sale del horno en la mañana (kg, promedio). Se vende hasta las 13:30. */
const PAN_MANANA_KG = 150;
/** Horneada de la tarde respecto de la de la mañana (supuesto: no hay dato real) */
const PAN_TARDE_SOBRE_MANANA = 0.6;
/** Ajuste por día de la semana (0 = domingo); el promedio es 1 */
const FACTOR_DIA = { 0: 1.05, 1: 0.97, 2: 0.97, 3: 0.98, 4: 0.98, 5: 1.0, 6: 1.05 };
/** Feriados: la tarde vende menos */
const FERIADOS = new Set(['2026-11-01']);
/** Cómo se reparte la horneada entre los PLU de pan al peso */
const MEZCLA_PAN = { 1: 0.82, 2: 0.1, 4: 0.08 };

/** Horario: [inicio, fin, intensidad relativa de clientes] */
const TRAMOS_MANANA = [
  ['07:00', '07:30', 0.6],
  ['07:30', '09:30', 1.6],
  ['09:30', '11:30', 0.8],
  ['11:30', '13:30', 1.1],
];
const TRAMOS_TARDE = [
  ['13:30', '16:30', 0.5],
  ['16:30', '17:30', 0.9],
  ['17:30', '19:45', 1.6],
  ['19:45', '20:15', 0.7],
];
const CAMBIO_TURNO = '14:00';

/** Turnos de mesoneras (código de la balanza) y la balanza que usa cada una */
const TURNOS = {
  semana: { manana: ['1', '2'], tarde: ['3', '4'] },
  sabado: { manana: ['3', '4'], tarde: ['1', '2'] },
  domingo: { manana: ['1', '3'], tarde: ['2', '4'] },
};
const BALANZA = { 1: 'B1', 2: 'B2', 3: 'B1', 4: 'B2' };
/** Probabilidad de que un ticket lleve una venta "Misc." (precio digitado). Parecida para todas. */
const TASA_MISC = { 1: 0.035, 2: 0.05, 3: 0.04, 4: 0.055 };
const MONTOS_MISC = [500, 1000, 1000, 1500, 2000, 2000, 2500, 3000];

/** Pastelería que se hornea en la mañana: demanda relativa por PLU */
const PASTELERIA = { 3: 5, 6: 3, 7: 3, 8: 0.6, 9: 1.2, 10: 0.5, 11: 1.5, 12: 1.2, 13: 0.8 };
/** Productos de mercadería que más salen en una panadería (por palabra del nombre) */
const BASICOS = /LECHE|HUEVO|MANTEQUILLA|MARGARINA|YOGH?URT|COCA|BEBIDA|JUGO|AGUA|QUESO|PATE|VIENESA|CAFE|TE |AZUCAR|MERMELADA|MANJAR/;

// ------------------------------------------------------------------ Utilidades

function opciones(argv) {
  const o = { desde: '2026-11-01', hasta: '2026-11-07', semilla: 20261101, api: 'http://localhost:8080/api', usuario: 'meson', salida: 'salida', soloArchivos: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--solo-archivos') o.soloArchivos = true;
    else if (a.startsWith('--')) o[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  o.semilla = Number(o.semilla);
  return o;
}

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla produce los mismos datos */
function generador(semilla) {
  let s = semilla >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (media, desv) => media + desv * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return {
    r,
    entre: (a, b) => a + (b - a) * r(),
    entero: (a, b) => a + Math.floor(r() * (b - a + 1)),
    normal,
    /** Lognormal por su mediana */
    lognormal: (mediana, sigma) => mediana * Math.exp(normal(0, sigma)),
    elegir: (items, pesos) => {
      const total = pesos.reduce((s, p) => s + p, 0);
      let x = r() * total;
      for (let i = 0; i < items.length; i++) if ((x -= pesos[i]) < 0) return items[i];
      return items[items.length - 1];
    },
    poisson: (lambda) => {
      let k = 0;
      for (let p = r(), l = Math.exp(-lambda); p > l; p *= r()) k++;
      return k;
    },
  };
}

const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hora = (seg) => [seg / 3600, (seg / 60) % 60, seg % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
/** kg con la división de la balanza (5 g) */
const kg5g = (kg) => Math.round(kg * 200) / 200;
const r3 = (n) => Math.round(n * 1000) / 1000;
const ddmmaaaa = (iso) => iso.split('-').reverse().join('-');

function dias(desde, hasta) {
  const out = [];
  for (let d = new Date(`${desde}T12:00:00Z`); d <= new Date(`${hasta}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Instante UTC (texto SQL) de una fecha y hora de Chile continental (considera horario de verano) */
function instanteChile(fecha, hhmm) {
  const comoUtc = new Date(`${fecha}T${hhmm}:00Z`);
  const zona = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'longOffset' })
    .formatToParts(comoUtc)
    .find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(zona);
  const offset = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(comoUtc.getTime() - offset * 60_000).toISOString().replace('T', ' ').replace('Z', '');
}

// ------------------------------------------------------------------ API de Patopan

function clienteApi(base) {
  let token = null;
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await res.text();
    const datos = texto ? JSON.parse(texto) : null;
    if (!res.ok) throw new Error(`${metodo} ${ruta} → HTTP ${res.status}: ${datos?.message ?? texto}`);
    return datos;
  };
  return {
    async login(usuario, clave) {
      token = (await pedir('POST', '/auth/login', { username: usuario, password: clave })).accessToken;
    },
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo),
  };
}

// ------------------------------------------------------------------ Generación de ventas

/**
 * Genera las ventas de un día. Devuelve los tickets (con hora, mesonera y líneas), la producción
 * de pan y pastelería, y lo que queda de pan al cierre.
 */
function simularDia(fecha, rnd, cat, panInicial, pastelInicial, correlativo) {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const factor = FACTOR_DIA[dow];
  const turnos = dow === 0 || FERIADOS.has(fecha) ? TURNOS.domingo : dow === 6 ? TURNOS.sabado : TURNOS.semana;
  const pluPan = Object.keys(MEZCLA_PAN);

  const produccion = { manana: {}, tarde: {} };
  const tickets = [];
  const vendidoPastel = {};
  let pan = { ...panInicial };

  // Pan de la mañana: ~150 kg que salen del horno temprano
  const hornoManana = Math.round(PAN_MANANA_KG * factor * rnd.normal(1, 0.025));
  // Pan de la tarde (supuesto): una fracción de la mañana; menos en feriado
  const hornoTarde = Math.round(PAN_MANANA_KG * PAN_TARDE_SOBRE_MANANA * factor * (FERIADOS.has(fecha) ? 0.75 : 1) * rnd.normal(1, 0.04));

  for (const [periodo, horneada, tramos] of [
    ['manana', hornoManana, TRAMOS_MANANA],
    ['tarde', hornoTarde, TRAMOS_TARDE],
  ]) {
    for (const plu of pluPan) {
      const kg = r3(horneada * MEZCLA_PAN[plu]);
      produccion[periodo][plu] = kg;
      pan[plu] = r3(pan[plu] + kg);
    }
    // Se vende entre el 93 % y el 98 % de lo disponible; el resto pasa al período siguiente
    const meta = {};
    for (const plu of pluPan) meta[plu] = pan[plu] * rnd.entre(0.93, 0.98);
    const vendido = Object.fromEntries(pluPan.map((p) => [p, 0]));
    const quedaPan = () => pluPan.some((p) => vendido[p] < meta[p]);

    const lineasPeriodo = [];
    while (quedaPan()) {
      const lineas = [];
      // Pan al peso: está en la mayoría de los tickets
      if (rnd.r() < (periodo === 'manana' ? 0.84 : 0.8)) {
        const disponibles = pluPan.filter((p) => vendido[p] < meta[p]);
        const plu = rnd.elegir(disponibles, disponibles.map((p) => MEZCLA_PAN[p]));
        const kg = Math.min(kg5g(Math.min(Math.max(rnd.lognormal(0.9, 0.5), 0.15), 4)), kg5g(meta[plu] - vendido[plu]) || 0.15);
        vendido[plu] += kg;
        lineas.push({ plu, cantidad: kg });
      }
      // Pastelería
      if (rnd.r() < 0.14) {
        const plu = rnd.elegir(Object.keys(PASTELERIA), Object.values(PASTELERIA));
        const cantidad = rnd.elegir([1, 2, 3, 4, 6], [6, 4, 1.5, 1, 0.5]);
        vendidoPastel[plu] = (vendidoPastel[plu] ?? 0) + cantidad;
        lineas.push({ plu, cantidad });
      }
      // Huevos (por unidad)
      if (rnd.r() < 0.07) lineas.push({ plu: '5', cantidad: rnd.elegir([1, 2, 3, 6, 10, 12, 30], [1, 2, 1, 4, 2, 3, 1]) });
      // Cecinas y quesos al peso
      if (rnd.r() < 0.12) {
        for (let i = 0, n = rnd.elegir([1, 2], [3, 1]); i < n; i++) {
          const p = rnd.elegir(cat.cecinas, cat.pesoCecinas);
          lineas.push({ plu: p.plu, cantidad: kg5g(Math.min(Math.max(rnd.lognormal(0.2, 0.45), 0.08), 1)) });
        }
      }
      // Mercadería
      for (let i = 0, n = rnd.poisson(0.38); i < n; i++) {
        const p = rnd.elegir(cat.mercaderia, cat.pesoMercaderia);
        lineas.push({ plu: p.plu, cantidad: rnd.elegir([1, 2, 3], [8, 2, 0.5]) });
      }
      if (lineas.length) lineasPeriodo.push(lineas);
    }
    for (const plu of pluPan) pan[plu] = r3(pan[plu] - vendido[plu]);

    // Hora de cada ticket según la intensidad de clientes de cada tramo
    const pesosTramo = tramos.map(([a, b, w]) => (minutos(b) - minutos(a)) * w);
    for (const lineas of lineasPeriodo) {
      const [a, b] = rnd.elegir(tramos, pesosTramo);
      const seg = Math.floor(rnd.entre(minutos(a) * 60, minutos(b) * 60));
      tickets.push({ seg, lineas });
    }
  }

  // Pastelería del día (sale del horno en la mañana): se hornea lo que se venderá más un pequeño sobrante,
  // descontando lo que quedó del día anterior
  const pastel = {};
  for (const plu of Object.keys(PASTELERIA)) {
    const vendido = vendidoPastel[plu] ?? 0;
    const horneado = Math.max(0, vendido + rnd.entero(2, 6) - pastelInicial[plu]);
    if (horneado > 0) produccion.manana[plu] = horneado;
    pastel[plu] = pastelInicial[plu] + horneado - vendido;
  }

  // Correlativo compartido por todas las balanzas; ~1 % de saltos (tickets anulados)
  tickets.sort((x, y) => x.seg - y.seg);
  for (const t of tickets) {
    if (rnd.r() < 0.01) correlativo.n++;
    t.numero = correlativo.n++;
    const turno = t.seg < minutos(CAMBIO_TURNO) * 60 ? turnos.manana : turnos.tarde;
    t.clerk = rnd.r() < 0.55 ? turno[0] : turno[1];
    if (rnd.r() < TASA_MISC[t.clerk]) t.lineas.push({ misc: rnd.elegir(MONTOS_MISC, MONTOS_MISC.map(() => 1)) });
  }
  return { tickets, produccion, panFinal: pan, pastelFinal: pastel, hornoManana, hornoTarde };
}

/** Filas del archivo de ventas del día, como las exportaría el software de las balanzas */
function filasArchivo(fecha, tickets, porPlu) {
  const filas = [['Fecha', 'Hora', 'Balanza', 'Ticket', 'Clerk', 'PLU No', 'Nombre', 'Cantidad', 'Precio unitario', 'Total']];
  let total = 0;
  for (const t of tickets) {
    for (const l of t.lineas) {
      const comun = [ddmmaaaa(fecha), hora(t.seg), BALANZA[t.clerk], t.numero, Number(t.clerk)];
      if (l.misc) {
        filas.push([...comun, '', 'Misc. Por Conteo', 1, l.misc, l.misc]);
        total += l.misc;
        continue;
      }
      const p = porPlu.get(String(l.plu));
      const monto = Math.round(l.cantidad * p.precio);
      filas.push([...comun, Number(p.plu), p.nombre, l.cantidad, p.precio, monto]);
      total += monto;
    }
  }
  // Fila de total al final, como en los reportes de la balanza (la importación la omite)
  filas.push([null, null, null, null, null, null, 'TOTAL', null, null, total]);
  return { filas, total };
}

/** Convierte las filas a las líneas que envía la pantalla de importación (columnas ya asignadas) */
function lineasImportacion(filas) {
  return filas.slice(1).map((f, i) => ({
    fila: i + 2,
    fecha: f[0],
    plu: f[5] === null || f[5] === '' ? null : String(f[5]),
    descripcion: f[6],
    cantidad: f[7],
    monto: f[9],
    mesonera: f[4] === null ? null : String(f[4]),
  }));
}

// ------------------------------------------------------------------ Programa

async function main() {
  const o = opciones(process.argv);
  const rnd = generador(o.semilla);
  const api = clienteApi(o.api.replace(/\/$/, ''));
  await api.login(o.usuario, process.env.MESON_CLAVE ?? 'mesonpatopan');

  // Catálogo real de Patopan (mismos PLU y precios que tendrían las balanzas)
  const productos = (await api.get('/productos')).filter((p) => p.activo);
  const porPlu = new Map(productos.map((p) => [p.plu, { ...p, precio: Number(p.precioVenta) }]));
  const mercaderia = productos.filter((p) => p.categoria === 'MERCADERIA' && p.plu !== '5');
  const cecinas = productos.filter((p) => p.categoria === 'CECINAS');
  // Popularidad: unos pocos productos venden mucho (Zipf); los básicos y baratos, más
  const orden = mercaderia.map((p) => ({ p, k: rnd.r() })).sort((a, b) => a.k - b.k);
  const cat = {
    mercaderia: orden.map((x) => x.p),
    pesoMercaderia: orden.map((x, i) => (BASICOS.test(x.p.nombre) ? 4 : 1) / Math.pow(i + 1, 0.9) / Math.sqrt(Number(x.p.precioVenta) / 1000)),
    cecinas,
    pesoCecinas: cecinas.map((p) => (/JAMON|QUESO|JAMONADA/.test(p.nombre) ? 3 : 1)),
  };

  // Simula toda la semana primero: el inventario inicial depende de lo que se venderá
  const fechas = dias(o.desde, o.hasta);
  const correlativo = { n: 8140 };
  let pan = { 1: r3(rnd.entre(5, 9)), 2: r3(rnd.entre(0.8, 1.6)), 4: r3(rnd.entre(0.5, 1.2)) };
  const panInicial = { ...pan };
  let pastel = Object.fromEntries(Object.keys(PASTELERIA).map((plu) => [plu, rnd.entero(2, 5)]));
  const pastelInicial = { ...pastel };
  const semana = [];
  for (const fecha of fechas) {
    const dia = simularDia(fecha, rnd, cat, pan, pastel, correlativo);
    pan = dia.panFinal;
    pastel = dia.pastelFinal;
    semana.push({ fecha, ...dia });
  }

  // Archivos del día
  const salida = path.resolve(__dirname, o.salida);
  fs.mkdirSync(salida, { recursive: true });
  const archivos = semana.map((d) => {
    const { filas, total } = filasArchivo(d.fecha, d.tickets, porPlu);
    const nombre = `Ventas_PATO_PAN_${ddmmaaaa(d.fecha)}.xlsx`;
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Ventas');
    XLSX.writeFile(libro, path.join(salida, nombre));
    console.log(
      `${d.fecha}  ${nombre}  tickets ${d.tickets.length}  filas ${filas.length - 2}  total $${total.toLocaleString('es-CL')}` +
        `  pan horno ${d.hornoManana} + ${d.hornoTarde} kg`,
    );
    return { fecha: d.fecha, nombre, filas, produccion: d.produccion };
  });
  if (o.soloArchivos) return;

  // Inventario inicial: lo que se venderá en la semana más un sobrante, para que nada termine en 0
  const vendidoSemana = new Map();
  for (const d of semana) for (const t of d.tickets) for (const l of t.lineas) if (!l.misc) vendidoSemana.set(String(l.plu), r3((vendidoSemana.get(String(l.plu)) ?? 0) + l.cantidad));
  const lineasIniciales = productos.map((p) => {
    let contado;
    if (MEZCLA_PAN[p.plu] !== undefined) contado = panInicial[p.plu];
    else if (PASTELERIA[p.plu] !== undefined) contado = pastelInicial[p.plu];
    else if (p.unidad === 'KG') contado = kg5g((vendidoSemana.get(p.plu) ?? 0) + rnd.entre(0.8, 3));
    else contado = Math.ceil((vendidoSemana.get(p.plu) ?? 0) * rnd.entre(1.2, 1.8)) + rnd.entero(3, 12);
    return { productoId: p.id, stockContado: contado, motivo: 'OTRO', detalle: 'Inventario inicial (toma de inventario)' };
  });

  const sql = ['-- Fechas y horas simuladas de cada conteo y carga de ventas', 'BEGIN;'];
  const fechar = (tipo, id, fecha, hhmm, observacion) => {
    const ts = instanteChile(fecha, hhmm);
    if (tipo === 'CONTEO') sql.push(`UPDATE conteos_inventario SET fecha = '${ts}' WHERE id = ${id};`);
    else sql.push(`UPDATE importaciones_balanza SET creado_en = '${ts}', observacion = '${observacion}' WHERE id = ${id};`);
    sql.push(`UPDATE movimientos_stock SET creado_en = '${ts}' WHERE origen_tipo = '${tipo}' AND origen_id = ${id};`);
  };

  const anterior = new Date(`${o.desde}T12:00:00Z`);
  anterior.setUTCDate(anterior.getUTCDate() - 1);
  const c0 = await api.post('/inventario/conteos', { observacion: 'Inventario inicial del mesón', lineas: lineasIniciales });
  fechar('CONTEO', c0.id, anterior.toISOString().slice(0, 10), '20:40');
  console.log(`Inventario inicial: conteo N° ${c0.id} (${lineasIniciales.length} productos)`);

  const stockDe = async () => new Map((await api.get('/inventario/stock')).filas.map((f) => [f.plu, f.stockActual]));
  const idPorPlu = new Map(productos.map((p) => [p.plu, p.id]));
  const salidaHorno = async (fecha, produccion, hhmm, nombre) => {
    const stock = await stockDe();
    const lineas = Object.entries(produccion).map(([plu, cantidad]) => ({
      productoId: idPorPlu.get(plu),
      stockContado: r3(stock.get(plu) + cantidad),
      motivo: 'OTRO',
      detalle: `Pan horneado: salida del horno ${nombre}`,
    }));
    const c = await api.post('/inventario/conteos', { observacion: `Salida del horno ${nombre}`, lineas });
    fechar('CONTEO', c.id, fecha, hhmm);
    return c.id;
  };

  for (const a of archivos) {
    const cm = await salidaHorno(a.fecha, a.produccion.manana, '06:30', 'de la mañana');
    const ct = await salidaHorno(a.fecha, a.produccion.tarde, '13:30', 'de la tarde');
    const cuerpo = { nombreArchivo: a.nombre, lineas: lineasImportacion(a.filas) };
    const revision = await api.post('/ventas/importar', { ...cuerpo, simular: true });
    if (revision.errores.length || revision.advertencias.length) {
      throw new Error(`${a.nombre}: ${JSON.stringify({ errores: revision.errores.slice(0, 3), advertencias: revision.advertencias })}`);
    }
    const r = await api.post('/ventas/importar', { ...cuerpo, simular: false });
    fechar('IMPORTACION_BALANZA', r.importacionId, a.fecha, '20:45', 'Datos simulados: archivo generado sin acceso a las balanzas reales');
    console.log(`${a.fecha}  horno N° ${cm}/${ct}  carga N° ${r.importacionId}  $${r.totales.ventas.toLocaleString('es-CL')}`);
  }

  sql.push('COMMIT;');
  fs.writeFileSync(path.join(salida, 'ajustar-fechas.sql'), sql.join('\n') + '\n');
  const negativos = [...(await stockDe()).entries()].filter(([, s]) => s <= 0);
  console.log(negativos.length ? `ATENCIÓN: productos en 0 o negativos: ${negativos.map(([p]) => p).join(', ')}` : 'Stock final: ningún producto en 0 ni negativo.');
  console.log(`Fechas simuladas: ${path.join(salida, 'ajustar-fechas.sql')}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
