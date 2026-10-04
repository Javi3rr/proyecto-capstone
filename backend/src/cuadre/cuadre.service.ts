import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fechaDesdeISO } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_LINEA = {
  cliente: { select: { id: true, nombre: true, modalidad: true, orden: true } },
  guias: { where: { estado: 'VIGENTE' as const }, select: { id: true } },
} as const;

type DespachoLinea = Prisma.DespachoGetPayload<{ include: typeof INCLUDE_LINEA }>;

export interface LineaCuadre {
  clienteId: number;
  cliente: string;
  kg: number;
  kgDescuento: number;
  precioKg: number;
  monto: number;
  guiaId: number | null;
}

function aLinea(d: DespachoLinea): LineaCuadre {
  return {
    clienteId: d.clienteId,
    cliente: d.cliente.nombre,
    kg: Number(d.kg),
    kgDescuento: Number(d.kgDescuento),
    precioKg: Number(d.precioKg),
    monto: Number(d.monto),
    guiaId: d.guias[0]?.id ?? null,
  };
}

const sumar = (lineas: LineaCuadre[], campo: 'kg' | 'monto') =>
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
    const ordenar = (a: DespachoLinea, b: DespachoLinea) => a.cliente.orden - b.cliente.orden;
    hoy.sort(ordenar);
    previos.sort(ordenar);

    const idsRepartidores = new Set(
      [...hoy, ...previos].map((d) => d.repartidorId).filter((id): id is number => id !== null),
    );
    const repartidores = await this.prisma.repartidor.findMany({
      where: { OR: [{ activo: true }, { id: { in: [...idsRepartidores] } }] },
      select: { id: true, nombre: true, patente: true },
      orderBy: { nombre: 'asc' },
    });

    const porRepartidor = repartidores.map((r) => {
      const cobrosDelDia = hoy
        .filter((d) => d.repartidorId === r.id && d.cliente.modalidad === 'REPARTO')
        .map(aLinea);
      const cobrosPagoDiaAnterior = previos.filter((d) => d.repartidorId === r.id).map(aLinea);
      const entregasPagoManana = hoy
        .filter((d) => d.repartidorId === r.id && d.cliente.modalidad === 'PAGO_DIA_SIGUIENTE')
        .map(aLinea);
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

    const presenciales = hoy.filter((d) => d.cliente.modalidad === 'PRESENCIAL').map(aLinea);
    const todas = hoy.map(aLinea);

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
        sinGuia: todas.filter((l) => l.guiaId === null).length,
      },
    };
  }
}
