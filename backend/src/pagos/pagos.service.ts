import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que un cliente debe pagar en un día de cuadre */
export interface Cargo {
  clienteId: number;
  /** Día en que se despachó el pan */
  fechaDespacho: string;
  /**
   * Día del cuadre en que se cobra:
   *  - Reparto y presencial: el mismo día.
   *  - Pago día siguiente: el siguiente día trabajado (null si aún no existe).
   */
  fechaCobro: string | null;
  kg: number;
  monto: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const redondear = (n: number) => Math.round(n);

/**
 * Pagos y saldos de clientes.
 * Saldo = lo despachado (ya cobrable) − lo pagado. Los pagos se registran desde el cuadre del día:
 * uno por cliente y día, y pueden ser parciales o incluir un abono a deuda anterior.
 */
@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cargos (un registro por cliente y día despachado), con su día de cobro */
  async cargos(clienteIds?: number[]): Promise<Cargo[]> {
    const filtroCliente = clienteIds ? { in: clienteIds } : undefined;
    const [jornadas, grupos, clientes] = await Promise.all([
      this.prisma.jornadaDespacho.findMany({ select: { id: true, fecha: true }, orderBy: { fecha: 'asc' } }),
      this.prisma.despacho.groupBy({
        by: ['clienteId', 'jornadaId'],
        where: { kg: { gt: 0 }, clienteId: filtroCliente },
        _sum: { monto: true, kg: true },
      }),
      this.prisma.cliente.findMany({ where: { id: filtroCliente }, select: { id: true, modalidad: true } }),
    ]);

    const posicion = new Map(jornadas.map((j, i) => [j.id, i]));
    const modalidad = new Map(clientes.map((c) => [c.id, c.modalidad]));

    return grupos.map((g) => {
      const i = posicion.get(g.jornadaId) ?? 0;
      const fechaDespacho = iso(jornadas[i].fecha);
      const siguiente = jornadas[i + 1];
      const fechaCobro =
        modalidad.get(g.clienteId) === 'PAGO_DIA_SIGUIENTE' ? (siguiente ? iso(siguiente.fecha) : null) : fechaDespacho;
      return {
        clienteId: g.clienteId,
        fechaDespacho,
        fechaCobro,
        kg: Number(g._sum.kg ?? 0),
        monto: Number(g._sum.monto ?? 0),
      };
    });
  }

  /** Saldo de cada cliente ANTES del cuadre de `fecha` (cargos cobrados en días anteriores − pagos anteriores) */
  async saldosAntesDe(fecha: string, clienteIds: number[]): Promise<Map<number, number>> {
    const saldos = new Map<number, number>(clienteIds.map((id) => [id, 0]));
    if (clienteIds.length === 0) return saldos;
    const [cargos, pagos] = await Promise.all([
      this.cargos(clienteIds),
      this.prisma.pago.groupBy({
        by: ['clienteId'],
        where: { clienteId: { in: clienteIds }, fecha: { lt: fechaDesdeISO(fecha) } },
        _sum: { monto: true },
      }),
    ]);
    for (const c of cargos) {
      if (c.fechaCobro !== null && c.fechaCobro < fecha) saldos.set(c.clienteId, (saldos.get(c.clienteId) ?? 0) + c.monto);
    }
    for (const p of pagos) saldos.set(p.clienteId, (saldos.get(p.clienteId) ?? 0) - Number(p._sum.monto ?? 0));
    for (const [id, v] of saldos) saldos.set(id, redondear(v));
    return saldos;
  }

  /** Pagos registrados en el cuadre de un día */
  async pagosDelDia(fecha: string): Promise<Map<number, number>> {
    const pagos = await this.prisma.pago.findMany({
      where: { fecha: fechaDesdeISO(fecha) },
      select: { clienteId: true, monto: true },
    });
    return new Map(pagos.map((p) => [p.clienteId, Number(p.monto)]));
  }

  /**
   * Registra (o corrige) lo que pagó un cliente en el cuadre de un día.
   * monto = 0 elimina el registro (el cliente no pagó).
   */
  async registrar(
    fecha: string,
    clienteId: number,
    datos: { monto: number; repartidorId?: number | null },
    usuarioId?: number,
  ) {
    if (fecha > hoySantiago()) throw new BadRequestException('No se pueden registrar pagos en fechas futuras');
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const where = { clienteId_fecha: { clienteId, fecha: fechaDesdeISO(fecha) } };
    const antes = await this.prisma.pago.findUnique({ where });

    if (datos.monto <= 0) {
      if (antes) {
        await this.prisma.pago.delete({ where });
        await this.auditar(usuarioId, clienteId, fecha, antes, null);
      }
      return { eliminado: true as const };
    }

    const valores = {
      monto: new Prisma.Decimal(datos.monto),
      repartidorId: datos.repartidorId ?? null,
      creadoPorId: usuarioId ?? null,
    };
    const pago = await this.prisma.pago.upsert({
      where,
      update: valores,
      create: { ...valores, clienteId, fecha: fechaDesdeISO(fecha) },
    });
    await this.auditar(usuarioId, clienteId, fecha, antes, pago);
    return pago;
  }

  /** Saldo pendiente de todos los clientes (los inactivos solo si deben algo) */
  async saldos() {
    const hoy = hoySantiago();
    const [clientes, cargos, pagos, ultimos] = await Promise.all([
      this.prisma.cliente.findMany({
        select: {
          id: true,
          nombre: true,
          modalidad: true,
          orden: true,
          activo: true,
          repartidor: { select: { id: true, nombre: true } },
        },
      }),
      this.cargos(),
      this.prisma.pago.groupBy({ by: ['clienteId'], _sum: { monto: true } }),
      this.prisma.pago.groupBy({ by: ['clienteId'], _max: { fecha: true } }),
    ]);

    const acum = new Map<number, { cargos: number; porCobrar: number; pagos: number }>();
    const fila = (id: number) => {
      if (!acum.has(id)) acum.set(id, { cargos: 0, porCobrar: 0, pagos: 0 });
      return acum.get(id)!;
    };
    for (const c of cargos) {
      if (c.fechaCobro !== null && c.fechaCobro <= hoy) fila(c.clienteId).cargos += c.monto;
      else fila(c.clienteId).porCobrar += c.monto;
    }
    for (const p of pagos) fila(p.clienteId).pagos += Number(p._sum.monto ?? 0);
    const ultimoPago = new Map(ultimos.map((u) => [u.clienteId, u._max.fecha ? iso(u._max.fecha) : null]));

    const orden = { PAGO_DIA_SIGUIENTE: 0, REPARTO: 1, PRESENCIAL: 2 } as const;
    return clientes
      .map((c) => {
        const a = acum.get(c.id) ?? { cargos: 0, porCobrar: 0, pagos: 0 };
        return {
          clienteId: c.id,
          cliente: c.nombre,
          modalidad: c.modalidad,
          repartidor: c.repartidor,
          activo: c.activo,
          totalDespachado: redondear(a.cargos),
          totalPagado: redondear(a.pagos),
          saldo: redondear(a.cargos - a.pagos),
          porCobrar: redondear(a.porCobrar),
          ultimoPago: ultimoPago.get(c.id) ?? null,
        };
      })
      .filter((s) => s.activo || s.saldo !== 0)
      .sort(
        (x, y) =>
          orden[x.modalidad] - orden[y.modalidad] ||
          (x.repartidor?.nombre ?? '').localeCompare(y.repartidor?.nombre ?? '') ||
          (clientes.find((c) => c.id === x.clienteId)?.orden ?? 0) - (clientes.find((c) => c.id === y.clienteId)?.orden ?? 0),
      );
  }

  /** Estado de cuenta de un cliente: por cada día de cobro, lo despachado, lo pagado y el saldo acumulado */
  async estadoCuenta(clienteId: number, desde: string, hasta: string) {
    if (desde > hasta) throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta"');
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nombre: true, modalidad: true, repartidor: { select: { id: true, nombre: true } } },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const [cargos, pagos] = await Promise.all([
      this.cargos([clienteId]),
      this.prisma.pago.findMany({ where: { clienteId }, include: { repartidor: { select: { nombre: true } } } }),
    ]);

    const saldoInicial = redondear(
      cargos.filter((c) => c.fechaCobro !== null && c.fechaCobro < desde).reduce((t, c) => t + c.monto, 0) -
        pagos.filter((p) => iso(p.fecha) < desde).reduce((t, p) => t + Number(p.monto), 0),
    );

    type Dia = {
      fecha: string;
      despachos: { fechaDespacho: string; kg: number; monto: number }[];
      cargo: number;
      pagado: number;
      recibidoPor: string | null;
    };
    const dias = new Map<string, Dia>();
    const dia = (f: string) => {
      if (!dias.has(f)) dias.set(f, { fecha: f, despachos: [], cargo: 0, pagado: 0, recibidoPor: null });
      return dias.get(f)!;
    };
    for (const c of cargos) {
      if (c.fechaCobro === null || c.fechaCobro < desde || c.fechaCobro > hasta) continue;
      const d = dia(c.fechaCobro);
      d.despachos.push({ fechaDespacho: c.fechaDespacho, kg: c.kg, monto: c.monto });
      d.cargo += c.monto;
    }
    for (const p of pagos) {
      const f = iso(p.fecha);
      if (f < desde || f > hasta) continue;
      const d = dia(f);
      d.pagado += Number(p.monto);
      d.recibidoPor = p.repartidor?.nombre ?? 'Despachador';
    }

    let saldo = saldoInicial;
    const movimientos = [...dias.values()]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((d) => {
        saldo += d.cargo - d.pagado;
        return { ...d, cargo: redondear(d.cargo), pagado: redondear(d.pagado), saldo: redondear(saldo) };
      });

    const porCobrar = cargos.filter((c) => c.fechaCobro === null).reduce((t, c) => t + c.monto, 0);

    return {
      cliente,
      desde,
      hasta,
      saldoInicial,
      movimientos,
      saldoFinal: redondear(saldo),
      porCobrar: redondear(porCobrar),
      totales: {
        cargo: redondear(movimientos.reduce((t, m) => t + m.cargo, 0)),
        pagado: redondear(movimientos.reduce((t, m) => t + m.pagado, 0)),
      },
    };
  }

  private auditar(usuarioId: number | undefined, clienteId: number, fecha: string, antes: unknown, despues: unknown) {
    return this.audit.registrar({
      usuarioId,
      accion: despues ? 'REGISTRAR_PAGO' : 'ELIMINAR_PAGO',
      recurso: `pago/cliente/${clienteId}/${fecha}`,
      detalle: { antes: antes ?? null, despues: despues ?? null },
    });
  }
}
