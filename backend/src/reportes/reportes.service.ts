import { BadRequestException, Injectable } from '@nestjs/common';
import { ModalidadCliente } from '@prisma/client';
import { fechaDesdeISO } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const kg3 = (n: number) => Math.round(n * 1000) / 1000;
const MAX_FILAS_HISTORIAL = 3000;
const MAX_MESES = 24;
/** Variación del promedio diario del último mes que se marca como anómala (±30 %) */
const UMBRAL_VARIACION = 30;

/** Lista de meses 'AAAA-MM' entre dos meses (inclusive) */
function mesesEntre(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  let [a, m] = desde.split('-').map(Number);
  const [ah, mh] = hasta.split('-').map(Number);
  while (a < ah || (a === ah && m <= mh)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return meses;
}

function ultimoDiaMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return iso(d);
}

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Historial de despachos (una fila por cliente, día y vuelta) con sus guías */
  async historial(filtro: {
    desde: string;
    hasta: string;
    clienteId?: number;
    repartidorId?: number;
    vuelta?: number;
    modalidad?: ModalidadCliente;
  }) {
    if (filtro.desde > filtro.hasta) throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta"');

    const filas = await this.prisma.despacho.findMany({
      where: {
        kg: { gt: 0 },
        jornada: { fecha: { gte: fechaDesdeISO(filtro.desde), lte: fechaDesdeISO(filtro.hasta) } },
        clienteId: filtro.clienteId,
        repartidorId: filtro.repartidorId,
        vuelta: filtro.vuelta,
        cliente: filtro.modalidad ? { modalidad: filtro.modalidad } : undefined,
      },
      include: {
        jornada: { select: { fecha: true } },
        cliente: { select: { id: true, nombre: true, modalidad: true, orden: true } },
        repartidor: { select: { id: true, nombre: true } },
        guias: {
          select: { id: true, estado: true, impresiones: true, motivoAnulacion: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: [{ jornada: { fecha: 'desc' } }, { vuelta: 'asc' }],
      take: MAX_FILAS_HISTORIAL + 1,
    });

    const truncado = filas.length > MAX_FILAS_HISTORIAL;
    const visibles = filas.slice(0, MAX_FILAS_HISTORIAL);

    // Nombre de quien registró cada línea
    const idsUsuarios = [...new Set(visibles.map((f) => f.creadoPorId).filter((id): id is number => id !== null))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: idsUsuarios } },
      select: { id: true, username: true },
    });
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.username]));

    const resultado = visibles
      .map((f) => ({
        id: f.id,
        fecha: iso(f.jornada.fecha),
        vuelta: f.vuelta,
        cliente: { id: f.cliente.id, nombre: f.cliente.nombre, modalidad: f.cliente.modalidad },
        orden: f.cliente.orden,
        repartidor: f.repartidor,
        kg: Number(f.kg),
        kgDescuento: Number(f.kgDescuento),
        precioKg: Number(f.precioKg),
        monto: Number(f.monto),
        guias: f.guias,
        registradoPor: f.creadoPorId ? (nombreUsuario.get(f.creadoPorId) ?? null) : null,
        actualizadoEn: f.actualizadoEn,
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.vuelta - b.vuelta || a.orden - b.orden)
      .map(({ orden: _orden, ...fila }) => fila);

    return {
      filas: resultado,
      truncado,
      totales: {
        registros: resultado.length,
        dias: new Set(resultado.map((f) => f.fecha)).size,
        kg: kg3(resultado.reduce((t, f) => t + f.kg, 0)),
        monto: Math.round(resultado.reduce((t, f) => t + f.monto, 0)),
        sinGuia: resultado.filter((f) => !f.guias.some((g) => g.estado === 'VIGENTE')).length,
      },
    };
  }

  /**
   * Promedio mensual de kg por cliente.
   *  - kg y días con despacho de cada mes.
   *  - Promedio mensual = total kg / meses con despacho.
   *  - Promedio diario = total kg / días con despacho.
   *  - Variación = promedio diario del último mes vs. el de los meses anteriores (sirve aunque el mes esté en curso).
   */
  async promedioMensual(filtro: { desde: string; hasta: string; repartidorId?: number; modalidad?: ModalidadCliente }) {
    if (filtro.desde > filtro.hasta) throw new BadRequestException('El mes "desde" no puede ser posterior a "hasta"');
    const meses = mesesEntre(filtro.desde, filtro.hasta);
    if (meses.length > MAX_MESES) throw new BadRequestException(`Elija un rango de hasta ${MAX_MESES} meses`);

    const despachos = await this.prisma.despacho.findMany({
      where: {
        kg: { gt: 0 },
        jornada: {
          fecha: { gte: fechaDesdeISO(`${filtro.desde}-01`), lte: fechaDesdeISO(ultimoDiaMes(filtro.hasta)) },
        },
        repartidorId: filtro.repartidorId,
        cliente: filtro.modalidad ? { modalidad: filtro.modalidad } : undefined,
      },
      select: {
        clienteId: true,
        kg: true,
        jornada: { select: { fecha: true } },
        cliente: {
          select: { nombre: true, modalidad: true, orden: true, repartidor: { select: { nombre: true } } },
        },
      },
    });

    type Acum = {
      clienteId: number;
      cliente: string;
      modalidad: ModalidadCliente;
      repartidor: string | null;
      orden: number;
      kg: number[];
      dias: Set<string>[];
    };
    const porCliente = new Map<number, Acum>();
    const indiceMes = new Map(meses.map((m, i) => [m, i]));

    for (const d of despachos) {
      const fecha = iso(d.jornada.fecha);
      const i = indiceMes.get(fecha.slice(0, 7));
      if (i === undefined) continue;
      let a = porCliente.get(d.clienteId);
      if (!a) {
        a = {
          clienteId: d.clienteId,
          cliente: d.cliente.nombre,
          modalidad: d.cliente.modalidad,
          repartidor: d.cliente.repartidor?.nombre ?? null,
          orden: d.cliente.orden,
          kg: meses.map(() => 0),
          dias: meses.map(() => new Set<string>()),
        };
        porCliente.set(d.clienteId, a);
      }
      a.kg[i] += Number(d.kg);
      a.dias[i].add(fecha);
    }

    const ordenModalidad = { PAGO_DIA_SIGUIENTE: 0, REPARTO: 1, PRESENCIAL: 2 } as const;
    const filas = [...porCliente.values()]
      .sort((x, y) => ordenModalidad[x.modalidad] - ordenModalidad[y.modalidad] || x.orden - y.orden)
      .map((a) => {
        const kgPorMes = a.kg.map(kg3);
        const diasPorMes = a.dias.map((s) => s.size);
        const totalKg = kg3(kgPorMes.reduce((t, k) => t + k, 0));
        const totalDias = diasPorMes.reduce((t, d) => t + d, 0);
        const mesesConDespacho = diasPorMes.filter((d) => d > 0).length;

        // Variación: último mes con despacho vs. promedio diario de los meses anteriores
        let variacion: number | null = null;
        const ultimo = diasPorMes.length - 1;
        const kgPrevios = kgPorMes.slice(0, ultimo).reduce((t, k) => t + k, 0);
        const diasPrevios = diasPorMes.slice(0, ultimo).reduce((t, d) => t + d, 0);
        if (diasPorMes[ultimo] > 0 && diasPrevios > 0 && kgPrevios > 0) {
          const diarioUltimo = kgPorMes[ultimo] / diasPorMes[ultimo];
          const diarioPrevio = kgPrevios / diasPrevios;
          variacion = Math.round(((diarioUltimo - diarioPrevio) / diarioPrevio) * 1000) / 10;
        }

        return {
          clienteId: a.clienteId,
          cliente: a.cliente,
          modalidad: a.modalidad,
          repartidor: a.repartidor,
          kgPorMes,
          diasPorMes,
          totalKg,
          totalDias,
          promedioMensual: mesesConDespacho ? kg3(totalKg / mesesConDespacho) : 0,
          promedioDiario: totalDias ? kg3(totalKg / totalDias) : 0,
          variacion,
          anomalia: variacion !== null && Math.abs(variacion) >= UMBRAL_VARIACION,
        };
      });

    return {
      meses,
      umbralVariacion: UMBRAL_VARIACION,
      filas,
      totalesPorMes: meses.map((_, i) => kg3(filas.reduce((t, f) => t + f.kgPorMes[i], 0))),
      totalKg: kg3(filas.reduce((t, f) => t + f.totalKg, 0)),
    };
  }
}
