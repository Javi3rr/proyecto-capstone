import { ConfigDte } from './dte.config';

/** Datos de una guía interna necesarios para armar el DTE 52 */
export interface GuiaParaDte {
  id: number;
  fecha: Date;
  vuelta: number;
  kg: number;
  kgDescuento: number;
  precioKg: number;
  monto: number;
  cliente: {
    nombre: string;
    modalidad: 'REPARTO' | 'PAGO_DIA_SIGUIENTE' | 'PRESENCIAL';
    rut: string | null;
    razonSocial: string | null;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
  };
  repartidor: { nombre: string; rut: string | null; patente: string | null } | null;
}

const NOMBRE_VUELTA: Record<number, string> = { 1: 'mañana', 2: 'tarde 1', 3: 'tarde 2' };

/** Recorta al largo máximo del formato SII */
export const corto = (t: string, max: number) => t.trim().slice(0, max);

/** Precio neto del kg con 2 decimales (el SII valida monto = cantidad × precio con este precio) */
export function precioNetoKg(precioKg: number, preciosConIva: boolean): number {
  return Math.round((preciosConIva ? precioKg / 1.19 : precioKg) * 100) / 100;
}

export interface ClienteReceptor {
  nombre: string;
  rut: string | null;
  razonSocial: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
}

/** Receptor del DTE. Sin RUT solo se permite fuera de producción, con el receptor de prueba. */
export function receptorDte(cliente: ClienteReceptor, c: ConfigDte, documento: string) {
  if (!cliente.rut) {
    if (c.modo === 'produccion') {
      throw new Error(`El cliente "${cliente.nombre}" no tiene RUT. Complételo en Clientes para emitir la ${documento}.`);
    }
    return { receptor: c.receptorPrueba, dePrueba: true };
  }
  return {
    receptor: {
      rut: cliente.rut,
      razonSocial: cliente.razonSocial || cliente.nombre,
      giro: cliente.giro || 'PARTICULAR',
      direccion: cliente.direccion || 'SIN DIRECCION',
      comuna: cliente.comuna || c.emisor.comuna,
    },
    dePrueba: false,
  };
}

/** Bloque Emisor, igual en todos los DTE de la panadería */
export function emisorDte(c: ConfigDte) {
  return {
    RUTEmisor: c.emisor.rut,
    RznSoc: corto(c.emisor.razonSocial, 100),
    GiroEmis: corto(c.emisor.giro, 80),
    Acteco: c.emisor.acteco,
    DirOrigen: corto(c.emisor.direccion, 70),
    CmnaOrigen: corto(c.emisor.comuna, 20),
    ...(c.emisor.sucursal ? { CdgSIISucur: c.emisor.sucursal } : {}),
  };
}

/** Fecha (AAAA-MM-DD) y hora (HH:MM:SS) de Chile de un instante */
function enSantiago(d: Date) {
  const zona = { timeZone: 'America/Santiago' } as const;
  return {
    fecha: new Intl.DateTimeFormat('en-CA', zona).format(d),
    hora: new Intl.DateTimeFormat('en-GB', { ...zona, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d),
  };
}

/** Datos del traslado que exige la Res. SII 144/2026 y que faltan en el reparto de esta guía */
export function datosTrasladoFaltantes(g: Pick<GuiaParaDte, 'cliente' | 'repartidor'>): string[] {
  const faltan: string[] = [];
  if (!g.repartidor) {
    faltan.push('repartidor (chofer y patente)');
  } else {
    if (!g.repartidor.rut) faltan.push(`RUT del chofer ${g.repartidor.nombre}`);
    if (!g.repartidor.patente) faltan.push(`patente del furgón de ${g.repartidor.nombre}`);
  }
  if (!g.cliente.direccion) faltan.push(`dirección del cliente ${g.cliente.nombre}`);
  if (!g.cliente.comuna) faltan.push(`comuna del cliente ${g.cliente.nombre}`);
  return faltan;
}

/**
 * Arma la guía de despacho electrónica (DTE tipo 52) en la estructura del formato SII,
 * en JSON, como la reciben los proveedores de facturación.
 *
 *  - IndTraslado 1: "operación constituye venta" (el pan se factura después).
 *  - TipoDespacho 2: despacho por cuenta del emisor a las instalaciones del cliente (reparto);
 *                 1: por cuenta del receptor (clientes presenciales que retiran).
 *  - Se cobra lo despachado menos el descuento diario del cliente (ej. 1 kg de la Suegra).
 *  - Datos del traslado (Res. Ex. SII 144/2026, Patopan = transporte autogestionado con furgones propios):
 *    chofer, patente, RUT del transportista (= la empresa), destino y fecha de salida y llegada (el mismo día).
 *    La hora de salida es opcional: se informa la hora de emisión si se emite el mismo día del reparto.
 *    En producción no se emite si falta alguno; fuera de producción se omite y queda como aviso.
 *    Quien retira en el local no requiere datos de transporte (resolutivo 15°).
 */
export function armarGuia52(g: GuiaParaDte, c: ConfigDte, ahora = new Date()) {
  const { receptor, dePrueba: sinRut } = receptorDte(g.cliente, c, 'guía electrónica');

  const kgCobrados = Math.max(g.kg - g.kgDescuento, 0);
  // Monto = cantidad × precio neto (así lo valida el SII)
  const precioNeto = precioNetoKg(g.precioKg, c.preciosConIva);
  const neto = Math.round(kgCobrados * precioNeto);
  const iva = Math.round(neto * 0.19);

  const fecha = g.fecha.toISOString().slice(0, 10);
  const presencial = g.cliente.modalidad === 'PRESENCIAL';
  const avisos: string[] = [];
  let transporte: Record<string, unknown> | null = null;
  if (!presencial) {
    const faltan = datosTrasladoFaltantes(g);
    if (faltan.length && c.modo === 'produccion') {
      throw new Error(`Faltan datos del traslado que exige el SII (Res. 144/2026) para la guía N° ${g.id}: ${faltan.join(', ')}.`);
    }
    if (faltan.length) avisos.push(`Faltan datos del traslado (Res. 144/2026): ${faltan.join(', ')}.`);

    const salida = enSantiago(ahora);
    const r = g.repartidor;
    transporte = {
      ...(r?.patente ? { Patente: corto(r.patente.replace(/[\s-]/g, '').toUpperCase(), 8) } : {}),
      RUTTrans: c.emisor.rut,
      ...(r?.rut ? { Chofer: { RUTChofer: r.rut, NombreChofer: corto(r.nombre, 30) } } : {}),
      DirDest: corto(g.cliente.direccion || receptor.direccion, 70),
      CmnaDest: corto(g.cliente.comuna || receptor.comuna, 20),
      FchSalida: fecha,
      ...(salida.fecha === fecha ? { HraSalida: salida.hora } : {}),
      FchLlegada: fecha,
    };
  }

  const detalleTexto =
    `Vuelta ${NOMBRE_VUELTA[g.vuelta] ?? g.vuelta} · ${g.kg} kg despachados` +
    (g.kgDescuento > 0 ? ` · ${g.kgDescuento} kg sin costo` : '') +
    ` · guía interna N° ${g.id}`;

  return {
    receptorDePrueba: sinRut,
    avisos,
    totales: { neto, iva, total: neto + iva },
    dte: {
      Encabezado: {
        IdDoc: {
          TipoDTE: 52,
          Folio: 0,
          FchEmis: fecha,
          IndTraslado: 1,
          TipoDespacho: presencial ? 1 : 2,
        },
        Emisor: emisorDte(c),
        Receptor: {
          RUTRecep: receptor.rut,
          RznSocRecep: corto(receptor.razonSocial, 100),
          GiroRecep: corto(receptor.giro, 40),
          DirRecep: corto(receptor.direccion, 70),
          CmnaRecep: corto(receptor.comuna, 20),
        },
        ...(transporte ? { Transporte: transporte } : {}),
        Totales: { MntNeto: neto, TasaIVA: '19', IVA: iva, MntTotal: neto + iva },
      },
      Detalle: [
        {
          NroLinDet: 1,
          NmbItem: 'PAN (KG)',
          DscItem: corto(detalleTexto, 1000),
          QtyItem: Math.round(kgCobrados * 1000) / 1000,
          UnmdItem: 'KG',
          PrcItem: precioNeto,
          MontoItem: neto,
        },
      ],
    },
  };
}
