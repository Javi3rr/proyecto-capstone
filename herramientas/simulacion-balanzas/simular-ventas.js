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

/**
 * Jornada según el día (datos de la panadería):
 *  - Lunes a sábado (07:00–20:15): pan de la mañana ~150 kg, se vende hasta las 13:30; pan de la tarde ~200 kg (la once).
 *  - Domingo, medio día (07:00–14:30): pan de las 07:00 ~150 kg y pan de las 12:30 ~120 kg.
 * Cada horneada: hora en que sale del horno, kg y tramos de venta [inicio, fin, intensidad relativa de clientes].
 */
const JORNADA = {
  semana: {
    hornos: [
      {
        nombre: 'de la mañana',
        sale: '06:30',
        kg: 150,
        tramos: [
          ['07:00', '07:30', 0.6],
          ['07:30', '09:30', 1.6],
          ['09:30', '11:30', 0.8],
          ['11:30', '13:30', 1.1],
        ],
      },
      {
        nombre: 'de la tarde',
        sale: '13:30',
        kg: 200,
        tramos: [
          ['13:30', '16:30', 0.5],
          ['16:30', '17:30', 0.9],
          ['17:30', '19:45', 1.6],
          ['19:45', '20:15', 0.7],
        ],
      },
    ],
    cierre: '20:45',
  },
  domingo: {
    hornos: [
      {
        nombre: 'de la mañana',
        sale: '07:00',
        kg: 150,
        tramos: [
          ['07:00', '08:00', 0.9],
          ['08:00', '10:30', 1.7],
          ['10:30', '12:30', 1.1],
        ],
      },
      {
        nombre: 'del mediodía',
        sale: '12:30',
        kg: 120,
        tramos: [
          ['12:30', '13:30', 1.6],
          ['13:30', '14:30', 0.9],
        ],
      },
    ],
    cierre: '14:45',
  },
};
/** Venta promedio del día (datos de la panadería): lunes a sábado $1.600.000, domingo $1.200.000 */
const VENTA_DIA = { semana: 1_600_000, domingo: 1_200_000 };
/** Ajuste por día de la semana (0 = domingo); de lunes a sábado promedia 1 */
const FACTOR_DIA = { 0: 1, 1: 0.96, 2: 0.96, 3: 0.98, 4: 0.98, 5: 1.04, 6: 1.08 };
/** Cómo se reparte la horneada entre los PLU de pan al peso */
const MEZCLA_PAN = { 1: 0.82, 2: 0.1, 4: 0.08 };

const CAMBIO_TURNO = '14:00';

/** Turnos de mesoneras (código de la balanza) y la balanza que usa cada una */
const TURNOS = {
  semana: { manana: ['1', '2'], tarde: ['3', '4'] },
  sabado: { manana: ['3', '4'], tarde: ['1', '2'] },
  domingo: { manana: ['2', '3'], tarde: ['2', '3'] },
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

const esDomingo = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;

/**
 * Genera las ventas de un día. Devuelve los tickets (con hora, mesonera y líneas), cada horneada con lo
 * que salió del horno (pan y, en la primera, la pastelería) y lo que queda de pan y pastelería al cierre.
 * k escala cuánta mercadería, cecinas, huevos y pastelería lleva cada ticket (el pan lo fijan las horneadas).
 */
function simularDia(fecha, rnd, cat, panInicial, pastelInicial, correlativoInicial, k) {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const jornada = dow === 0 ? JORNADA.domingo : JORNADA.semana;
  const turnos = dow === 0 ? TURNOS.domingo : dow === 6 ? TURNOS.sabado : TURNOS.semana;
  const pluPan = Object.keys(MEZCLA_PAN);

  const hornos = jornada.hornos.map((h) => ({ nombre: h.nombre, sale: h.sale, kg: Math.round(h.kg * rnd.normal(1, 0.03)), produccion: {} }));
  const tickets = [];
  const vendidoPastel = {};
  let pan = { ...panInicial };

  for (const [i, horno] of hornos.entries()) {
    const tramos = jornada.hornos[i].tramos;
    const primera = i === 0;
    for (const plu of pluPan) {
      const kg = r3(horno.kg * MEZCLA_PAN[plu]);
      horno.produccion[plu] = kg;
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
      if (rnd.r() < (primera ? 0.84 : 0.8)) {
        const disponibles = pluPan.filter((p) => vendido[p] < meta[p]);
        const plu = rnd.elegir(disponibles, disponibles.map((p) => MEZCLA_PAN[p]));
        const kg = Math.min(kg5g(Math.min(Math.max(rnd.lognormal(0.9, 0.5), 0.15), 4)), kg5g(meta[plu] - vendido[plu]) || 0.15);
        vendido[plu] += kg;
        lineas.push({ plu, cantidad: kg });
      }
      // Pastelería
      if (rnd.r() < Math.min(0.14 * k, 0.6)) {
        const plu = rnd.elegir(Object.keys(PASTELERIA), Object.values(PASTELERIA));
        const cantidad = rnd.elegir([1, 2, 3, 4, 6], [6, 4, 1.5, 1, 0.5]);
        vendidoPastel[plu] = (vendidoPastel[plu] ?? 0) + cantidad;
        lineas.push({ plu, cantidad });
      }
      // Huevos (por unidad)
      if (rnd.r() < Math.min(0.07 * k, 0.4)) lineas.push({ plu: '5', cantidad: rnd.elegir([1, 2, 3, 6, 10, 12, 30], [1, 2, 1, 4, 2, 3, 1]) });
      // Cecinas y quesos al peso
      if (rnd.r() < Math.min(0.12 * k, 0.6)) {
        for (let i = 0, n = rnd.elegir([1, 2], [3, 1]); i < n; i++) {
          const p = rnd.elegir(cat.cecinas, cat.pesoCecinas);
          lineas.push({ plu: p.plu, cantidad: kg5g(Math.min(Math.max(rnd.lognormal(0.2, 0.45), 0.08), 1)) });
        }
      }
      // Mercadería
      for (let j = 0, n = rnd.poisson(0.38 * k); j < n; j++) {
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
    if (horneado > 0) hornos[0].produccion[plu] = horneado;
    pastel[plu] = pastelInicial[plu] + horneado - vendido;
  }

  // Correlativo compartido por todas las balanzas; ~1 % de saltos (tickets anulados)
  let correlativo = correlativoInicial;
  tickets.sort((x, y) => x.seg - y.seg);
  for (const t of tickets) {
    if (rnd.r() < 0.01) correlativo++;
    t.numero = correlativo++;
    const turno = t.seg < minutos(CAMBIO_TURNO) * 60 ? turnos.manana : turnos.tarde;
    t.clerk = rnd.r() < 0.55 ? turno[0] : turno[1];
    if (rnd.r() < TASA_MISC[t.clerk]) t.lineas.push({ misc: rnd.elegir(MONTOS_MISC, MONTOS_MISC.map(() => 1)) });
  }
  return { tickets, hornos, cierre: jornada.cierre, panFinal: pan, pastelFinal: pastel, correlativoFinal: correlativo };
}

/** Monto vendido de pan al peso (lo fijan las horneadas) */
const montoPan = (tickets, porPlu) =>
  tickets.reduce((s, t) => s + t.lineas.reduce((a, l) => a + (MEZCLA_PAN[l.plu] !== undefined ? Math.round(l.cantidad * porPlu.get(String(l.plu)).precio) : 0), 0), 0);

/**
 * Simula el día buscando que la venta total se acerque a la meta: el pan queda fijo y se ajusta cuánto
 * de lo demás lleva cada ticket. Cada intento usa la misma semilla del día, así el resultado es reproducible.
 */
function ventasDelDia(fecha, semillaDia, cat, porPlu, pan, pastel, correlativo, meta) {
  let k = 1;
  let mejor = null;
  for (let intento = 0; intento < 20; intento++) {
    const dia = simularDia(fecha, generador(semillaDia + intento), cat, pan, pastel, correlativo, k);
    const total = filasArchivo(fecha, dia.tickets, porPlu).total;
    const error = Math.abs(total - meta) / meta;
    if (!mejor || error < mejor.error) mejor = { dia, error };
    if (error < 0.01) break;
    const dePan = montoPan(dia.tickets, porPlu);
    k = Math.max(0.05, (k * Math.max(meta - dePan, meta * 0.05)) / Math.max(total - dePan, 1));
  }
  return mejor.dia;
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
  let correlativo = 8140;
  let pan = { 1: r3(rnd.entre(5, 9)), 2: r3(rnd.entre(0.8, 1.6)), 4: r3(rnd.entre(0.5, 1.2)) };
  const panInicial = { ...pan };
  let pastel = Object.fromEntries(Object.keys(PASTELERIA).map((plu) => [plu, rnd.entero(2, 5)]));
  const pastelInicial = { ...pastel };
  // Meta de cada día: venta promedio según el día con variación natural (±3 %), ajustada para que
  // lunes a sábado promedien VENTA_DIA.semana y los domingos VENTA_DIA.domingo
  const metas = fechas.map((f) => (esDomingo(f) ? 1 : FACTOR_DIA[new Date(`${f}T12:00:00Z`).getUTCDay()]) * rnd.normal(1, 0.03));
  for (const domingo of [true, false]) {
    const idx = fechas.map((f, i) => i).filter((i) => esDomingo(fechas[i]) === domingo);
    const promedio = idx.reduce((s, i) => s + metas[i], 0) / (idx.length || 1);
    for (const i of idx) metas[i] = Math.round((metas[i] / promedio) * (domingo ? VENTA_DIA.domingo : VENTA_DIA.semana));
  }

  const semana = [];
  for (const [i, fecha] of fechas.entries()) {
    const meta = metas[i];
    const dia = ventasDelDia(fecha, o.semilla + (i + 1) * 7919, cat, porPlu, pan, pastel, correlativo, meta);
    pan = dia.panFinal;
    pastel = dia.pastelFinal;
    correlativo = dia.correlativoFinal;
    semana.push({ fecha, meta, ...dia });
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
      `${d.fecha}  ${nombre}  tickets ${d.tickets.length}  total $${total.toLocaleString('es-CL')} (meta $${d.meta.toLocaleString('es-CL')})` +
        `  pan ${d.hornos.map((h) => `${h.sale} ${h.kg} kg`).join(' + ')}`,
    );
    return { fecha: d.fecha, nombre, filas, hornos: d.hornos, cierre: d.cierre };
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

  const sql = ['-- Fecha y hora de cada conteo y carga de ventas', 'BEGIN;'];
  const fechar = (tipo, id, fecha, hhmm) => {
    const ts = instanteChile(fecha, hhmm);
    if (tipo === 'CONTEO') sql.push(`UPDATE conteos_inventario SET fecha = '${ts}' WHERE id = ${id};`);
    else sql.push(`UPDATE importaciones_balanza SET creado_en = '${ts}' WHERE id = ${id};`);
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
    const conteos = [];
    for (const h of a.hornos) conteos.push(await salidaHorno(a.fecha, h.produccion, h.sale, h.nombre));
    const cuerpo = { nombreArchivo: a.nombre, lineas: lineasImportacion(a.filas) };
    const revision = await api.post('/ventas/importar', { ...cuerpo, simular: true });
    if (revision.errores.length || revision.advertencias.length) {
      throw new Error(`${a.nombre}: ${JSON.stringify({ errores: revision.errores.slice(0, 3), advertencias: revision.advertencias })}`);
    }
    const r = await api.post('/ventas/importar', { ...cuerpo, simular: false });
    fechar('IMPORTACION_BALANZA', r.importacionId, a.fecha, a.cierre);
    console.log(`${a.fecha}  horno N° ${conteos.join('/')}  carga N° ${r.importacionId}  $${r.totales.ventas.toLocaleString('es-CL')}`);
  }

  sql.push('COMMIT;');
  fs.writeFileSync(path.join(salida, 'ajustar-fechas.sql'), sql.join('\n') + '\n');
  const negativos = [...(await stockDe()).entries()].filter(([, s]) => s <= 0);
  console.log(negativos.length ? `ATENCIÓN: productos en 0 o negativos: ${negativos.map(([p]) => p).join(', ')}` : 'Stock final: ningún producto en 0 ni negativo.');
  console.log(`Fechas y horas: ${path.join(salida, 'ajustar-fechas.sql')}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
