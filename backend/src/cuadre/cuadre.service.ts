import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fechaDesdeISO } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_LINEA = {
  cliente: { select: { id: true, nombre: true, modalidad: true, orden: true } },
  guias: { where: { estado: 'VIGENTE' as const }, select: { id: true } },
} as const;

type DespachoLinea = Prisma.DespachoGetPayload<{ include: typeof INCLUDE_LINEA }>;

/** Resumen de un cliente en el día (suma de sus vueltas) */
export interface LineaCuadre {
  clienteId: number;
  cliente: string;
  vueltas: number[];
  kg: number;
  kgDescuento: number;
  precioKg: number;
  monto: number;
  guiaIds: number[];
  /** Vueltas con pan que aún no tienen guía emitida */
  sinGuia: number;
}

/** Agrupa las líneas (una por vuelta) en una fila por cliente, en el orden de la planilla */
function agrupar(despachos: DespachoLinea[]): LineaCuadre[] {
  const porCliente = new Map<number, DespachoLinea[]>();
  for (const d of [...despachos].sort((a, b) => a.cliente.orden - b.cliente.orden || a.vuelta - b.vuelta)) {
    porCliente.set(d.clienteId, [...(porCliente.get(d.clienteId) ?? []), d]);
  }
  return [...porCliente.values()].map((ls) => ({
    clienteId: ls[0].clienteId,
    cliente: ls[0].cliente.nombre,
    vueltas: ls.map((l) => l.vuelta),
    kg: Math.round(ls.reduce((t, l) => t + Number(l.kg), 0) * 1000) / 1000,
    kgDescuento: ls.reduce((t, l) => t + Number(l.kgDescuento), 0),
    precioKg: Number(ls[0].precioKg),
    monto: ls.reduce((t, l) => t + Number(l.monto), 0),
    guiaIds: ls.flatMap((l) => l.guias.map((g) => g.id)),
    sinGuia: ls.filter((l) => l.guias.length === 0).length,
  }));
}

const sumar = (lineas: LineaCuadre[], campo: 'kg' | 'monto' | 'sinGuia') =>
  Math.round(lineas.reduce((t, l) => t + l[campo], 0) * 1000) / 1000;

/**
 * Cuadre por repartidor:
 *  - Cobra hoy: sus clientes de REPARTO de hoy + sus clientes de PAGO DÍA SIGUIENTE del día anterior trabajado.
 *  - Entrega hoy y cobra mañana: sus clientes de PAGO DÍA SIGUIENTE de hoy.
 *  - Presenciales: se cuadran aparte (los atiende el despachador).
 */
@Injectable()
export class CuadreService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(fecha: string) {
    const fechaD = fechaDesdeISO(fecha);
    const [jornada, anterior] = await Promise.all([
      this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaD } }),
      this.prisma.jornadaDespacho.findFirst({ where: { fecha: { lt: fechaD } }, orderBy: { fecha: 'desc' } }),
    ]);

    const [hoy, previos] = await Promise.all([
      jornada
        ? this.prisma.despacho.findMany({ where: { jornadaId: jornada.id, kg: { gt: 0 } }, include: INCLUDE_LINEA })
        : Promise.resolve([] as DespachoLinea[]),
      anterior
        ? this.prisma.despacho.findMany({
            where: { jornadaId: anterior.id, kg: { gt: 0 }, cliente: { modalidad: 'PAGO_DIA_SIGUIENTE' } },
            include: INCLUDE_LINEA,
          })
        : Promise.resolve([] as DespachoLinea[]),
    ]);

    const idsRepartidores = new Set(
      [...hoy, ...previos].map((d) => d.repartidorId).filter((id): id is number => id !== null),
    );
    const repartidores = await this.prisma.repartidor.findMany({
      where: { OR: [{ activo: true }, { id: { in: [...idsRepartidores] } }] },
      select: { id: true, nombre: true, patente: true },
      orderBy: { nombre: 'asc' },
    });

    const porRepartidor = repartidores.map((r) => {
      const cobrosDelDia = agrupar(
        hoy.filter((d) => d.repartidorId === r.id && d.cliente.modalidad === 'REPARTO'),
      );
      const cobrosPagoDiaAnterior = agrupar(previos.filter((d) => d.repartidorId === r.id));
      const entregasPagoManana = agrupar(
        hoy.filter((d) => d.repartidorId === r.id && d.cliente.modalidad === 'PAGO_DIA_SIGUIENTE'),
      );
      const entregados = [...cobrosDelDia, ...entregasPagoManana];
      const aCobrar = [...cobrosDelDia, ...cobrosPagoDiaAnterior];
      return {
        repartidor: r,
        cobrosDelDia,
        cobrosPagoDiaAnterior,
        entregasPagoManana,
        totales: {
          kgEntregados: sumar(entregados, 'kg'),
          montoACobrar: sumar(aCobrar, 'monto'),
          montoPagoManana: sumar(entregasPagoManana, 'monto'),
        },
      };
    });

    const presenciales = agrupar(hoy.filter((d) => d.cliente.modalidad === 'PRESENCIAL'));
    const todas = agrupar(hoy);

    return {
      fecha,
      cerrada: jornada?.cerrada ?? false,
      fechaAnterior: anterior ? anterior.fecha.toISOString().slice(0, 10) : null,
      repartidores: porRepartidor.filter(
        (p) => p.cobrosDelDia.length + p.cobrosPagoDiaAnterior.length + p.entregasPagoManana.length > 0,
      ),
      presenciales: {
        lineas: presenciales,
        totales: { kg: sumar(presenciales, 'kg'), monto: sumar(presenciales, 'monto') },
      },
      totalesDia: {
        kg: sumar(todas, 'kg'),
        monto: sumar(todas, 'monto'),
        /** Vueltas con pan sin guía emitida */
        sinGuia: sumar(todas, 'sinGuia'),
      },
    };
  }
}
