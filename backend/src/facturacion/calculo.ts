import { Prisma } from '@prisma/client';
import { precioNetoKg } from '../dte/guia52';

type Num = Prisma.Decimal | number | string;

export const TASA_IVA = 0.19;

/**
 * Último día para emitir la factura de las guías de un mes 'AAAA-MM':
 * el día 10 del mes siguiente (art. 55 de la Ley del IVA). Ej.: '2026-10' -> '2026-11-10', '2026-12' -> '2027-01-10'
 */
export function plazoLegal(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const siguiente = new Date(Date.UTC(a, m, 10));
  return siguiente.toISOString().slice(0, 10);
}

/** Lo que se necesita de cada guía para facturarla */
export interface GuiaFacturable {
  kg: Num;
  kgDescuento: Num;
  precioKg: Num;
  monto: Num;
}

/** Línea de la factura: todas las guías del mes con el mismo precio del kg */
export interface LineaFactura {
  /** Precio del kg cobrado en las guías (con IVA si DTE_PRECIOS_CON_IVA=true) */
  precioKg: number;
  /** Precio neto del kg que va en la factura */
  precioNeto: number;
  /** Kg cobrados (despachados menos el descuento diario) */
  kg: number;
  guias: number;
  /** kg × precioNeto, redondeado a pesos */
  neto: number;
}

export interface CalculoFactura {
  lineas: LineaFactura[];
  kg: number;
  /** Suma de los montos de las guías (lo que se le cobró al cliente) */
  montoGuias: number;
  neto: number;
  iva: number;
  total: number;
}

/**
 * Factura del mes a partir de las guías:
 *   1. Se agrupan las guías por precio del kg (cambia si sube el precio a mitad de mes).
 *   2. Cada línea: kg cobrados × precio neto del kg (si el precio incluye IVA, precio / 1,19 con 2 decimales).
 *   3. Neto = suma de las líneas; IVA = 19 % del neto; Total = neto + IVA.
 * Ej.: 300 kg a $1.700 con IVA -> precio neto $1.428,57 -> neto $428.571, IVA $81.428, total $509.999
 * (las guías sumaban $510.000: la diferencia es solo el redondeo del precio neto).
 */
export function calcularFactura(guias: GuiaFacturable[], preciosConIva: boolean): CalculoFactura {
  const porPrecio = new Map<string, { precioKg: Prisma.Decimal; kg: Prisma.Decimal; guias: number }>();
  let montoGuias = new Prisma.Decimal(0);
  for (const g of guias) {
    const precioKg = new Prisma.Decimal(g.precioKg);
    const clave = precioKg.toFixed(2);
    const linea = porPrecio.get(clave) ?? { precioKg, kg: new Prisma.Decimal(0), guias: 0 };
    linea.kg = linea.kg.plus(Prisma.Decimal.max(new Prisma.Decimal(g.kg).minus(g.kgDescuento), 0));
    linea.guias++;
    porPrecio.set(clave, linea);
    montoGuias = montoGuias.plus(g.monto);
  }

  const lineas = [...porPrecio.values()]
    .sort((a, b) => a.precioKg.comparedTo(b.precioKg))
    .map((l) => {
      const precioNeto = precioNetoKg(l.precioKg.toNumber(), preciosConIva);
      return {
        precioKg: l.precioKg.toNumber(),
        precioNeto,
        kg: l.kg.toNumber(),
        guias: l.guias,
        neto: l.kg.mul(precioNeto).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber(),
      };
    });

  const neto = lineas.reduce((s, l) => s + l.neto, 0);
  const iva = Math.round(neto * TASA_IVA);
  return {
    lineas,
    kg: lineas.reduce((s, l) => s.plus(l.kg), new Prisma.Decimal(0)).toNumber(),
    montoGuias: montoGuias.toNumber(),
    neto,
    iva,
    total: neto + iva,
  };
}
