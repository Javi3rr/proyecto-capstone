import { Prisma } from '@prisma/client';

type Num = Prisma.Decimal | number | string;

/**
 * Monto a cobrar por una línea de despacho:
 *   max(kg - kgDescuento, 0) × precioKg, redondeado a pesos.
 * Ej. Suegra: 10 kg, 1 kg de descuento, $1.700 -> 9 × 1.700 = $15.300
 */
export function calcularMonto(kg: Num, kgDescuento: Num, precioKg: Num): Prisma.Decimal {
  const cobrable = Prisma.Decimal.max(new Prisma.Decimal(kg).minus(kgDescuento), 0);
  return cobrable.mul(precioKg).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** Valida 'YYYY-MM-DD' */
export function esFechaISO(valor: string | undefined): valor is string {
  return !!valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}
