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
const corto = (t: string, max: number) => t.trim().slice(0, max);

/**
 * Arma la guía de despacho electrónica (DTE tipo 52) en la estructura del formato SII,
 * en JSON, como la reciben los proveedores de facturación.
 *
 *  - IndTraslado 1: "operación constituye venta" (el pan se factura después).
 *  - TipoDespacho 2: despacho por cuenta del emisor a las instalaciones del cliente (reparto);
 *                 1: por cuenta del receptor (clientes presenciales que retiran).
 *  - Se cobra lo despachado menos el descuento diario del cliente (ej. 1 kg de la Suegra).
 */
export function armarGuia52(g: GuiaParaDte, c: ConfigDte) {
  const sinRut = !g.cliente.rut;
  if (sinRut && c.modo === 'produccion') {
    throw new Error(`El cliente "${g.cliente.nombre}" no tiene RUT. Complételo en Clientes para emitir la guía electrónica.`);
  }
  const receptor = sinRut
    ? c.receptorPrueba
    : {
        rut: g.cliente.rut!,
        razonSocial: g.cliente.razonSocial || g.cliente.nombre,
        giro: g.cliente.giro || 'PARTICULAR',
        direccion: g.cliente.direccion || 'SIN DIRECCION',
        comuna: g.cliente.comuna || c.emisor.comuna,
      };

  const kgCobrados = Math.max(g.kg - g.kgDescuento, 0);
  // Precio neto con 2 decimales y monto = cantidad × precio (así lo valida el SII)
  const precioNeto = Math.round((c.preciosConIva ? g.precioKg / 1.19 : g.precioKg) * 100) / 100;
  const neto = Math.round(kgCobrados * precioNeto);
  const iva = Math.round(neto * 0.19);

  const presencial = g.cliente.modalidad === 'PRESENCIAL';
  const transporte: Record<string, unknown> = {};
  if (!presencial) {
    if (g.repartidor?.patente) transporte.Patente = corto(g.repartidor.patente, 8);
    if (g.repartidor?.rut) transporte.Chofer = { RUTChofer: g.repartidor.rut, NombreChofer: corto(g.repartidor.nombre, 30) };
    transporte.DirDest = corto(receptor.direccion, 70);
    transporte.CmnaDest = corto(receptor.comuna, 20);
  }

  const detalleTexto =
    `Vuelta ${NOMBRE_VUELTA[g.vuelta] ?? g.vuelta} · ${g.kg} kg despachados` +
    (g.kgDescuento > 0 ? ` · ${g.kgDescuento} kg sin costo` : '') +
    ` · guía interna N° ${g.id}`;

  const fecha = g.fecha.toISOString().slice(0, 10);
  return {
    receptorDePrueba: sinRut,
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
        Emisor: {
          RUTEmisor: c.emisor.rut,
          RznSoc: corto(c.emisor.razonSocial, 100),
          GiroEmis: corto(c.emisor.giro, 80),
          Acteco: c.emisor.acteco,
          DirOrigen: corto(c.emisor.direccion, 70),
          CmnaOrigen: corto(c.emisor.comuna, 20),
          ...(c.emisor.sucursal ? { CdgSIISucur: c.emisor.sucursal } : {}),
        },
        Receptor: {
          RUTRecep: receptor.rut,
          RznSocRecep: corto(receptor.razonSocial, 100),
          GiroRecep: corto(receptor.giro, 40),
          DirRecep: corto(receptor.direccion, 70),
          CmnaRecep: corto(receptor.comuna, 20),
        },
        ...(Object.keys(transporte).length ? { Transporte: transporte } : {}),
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
