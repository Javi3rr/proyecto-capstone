import { Prisma, TipoMovimiento } from '@prisma/client';

export interface NuevoMovimiento {
  productoId: number;
  tipo: TipoMovimiento;
  /** Positivo = entrada; negativo = salida */
  cantidad: Prisma.Decimal | number | string;
  origenTipo: 'FACTURA' | 'IMPORTACION_BALANZA' | 'CONTEO' | 'MANUAL';
  origenId?: number | null;
  motivo?: string | null;
  codigoMesonera?: string | null;
  usuarioId?: number | null;
}

/**
 * Único punto por donde cambia el stock: actualiza producto.stockActual y deja el movimiento
 * (kardex) con el saldo resultante. Debe llamarse dentro de una transacción.
 */
export async function registrarMovimiento(tx: Prisma.TransactionClient, m: NuevoMovimiento) {
  const cantidad = new Prisma.Decimal(m.cantidad);
  const producto = await tx.producto.update({
    where: { id: m.productoId },
    data: { stockActual: { increment: cantidad } },
    select: { stockActual: true },
  });
  return tx.movimientoStock.create({
    data: {
      productoId: m.productoId,
      tipo: m.tipo,
      cantidad,
      saldoResultante: producto.stockActual,
      origenTipo: m.origenTipo,
      origenId: m.origenId ?? null,
      motivo: m.motivo ?? null,
      codigoMesonera: m.codigoMesonera ?? null,
      usuarioId: m.usuarioId ?? null,
    },
  });
}
