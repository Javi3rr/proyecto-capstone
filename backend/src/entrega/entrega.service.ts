import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ModalidadCliente } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const kg3 = (n: number) => Math.round(n * 1000) / 1000;

/** Lo despachado a un cliente en un día (suma de sus vueltas) */
export interface Cargo {
  fecha: string;
  kg: number;
  monto: number;
}

/** Un cliente dentro de la entrega de un repartidor */
export interface FilaEntrega {
  clienteId: number;
  cliente: string;
  modalidad: ModalidadCliente;
  /** Días que se cobran hoy (el de hoy y/o días anteriores pendientes) */
  cargos: Cargo[];
  kg: number;
  monto: number;
  /** Si se marcó "no pagó" hoy: la nota (los cargos quedan pendientes para su próximo día con pan) */
  noPago: { nota: string | null } | null;
}

interface RepartidorRef {
  id: number;
  nombre: string;
  patente: string | null;
}

interface ClienteInfo {
  id: number;
  nombre: string;
  modalidad: ModalidadCliente;
  activo: boolean;
  repartidorId: number | null;
  cobradorId: number | null;
}

/**
 * Entrega del día (reemplaza el cuadre con pagos y saldos).
 *
 * Reglas, iguales a como se trabaja con el cuaderno:
 *  - Reparto y presencial: lo de hoy se cobra hoy.
 *  - Pago día siguiente: se cobra el PRÓXIMO día en que el cliente vuelva a recibir pan
 *    (si no trabaja el sábado, lo del viernes se cobra el domingo; si faltan varios días, se junta).
 *  - "No pagó": el cliente recibió pan pero no pagó; todo lo que debía pasa a su próximo día con pan.
 *  - Lo de reparto lo rinde quien repartió ese día. Lo de pago día siguiente lo rinde el cobrador
 *    del cliente; si ese día un solo repartidor hizo todo el reparto, lo rinde él.
 *
 * Todo se calcula a partir de la planilla y de las marcas de "no pagó": no hay montos que digitar.
 */
@Injectable()
export class EntregaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async obtener(fecha: string) {
    const fechaD = fechaDesdeISO(fecha);
    const [clientes, jornadas, grupos, noPagos] = await Promise.all([
      this.prisma.cliente.findMany({
        select: { id: true, nombre: true, modalidad: true, activo: true, repartidorId: true, cobradorId: true, orden: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      }),
      this.prisma.jornadaDespacho.findMany({
        where: { fecha: { lte: fechaD } },
        select: { id: true, fecha: true, cerrada: true, repartidorUnicoId: true },
      }),
      this.prisma.despacho.groupBy({
        by: ['clienteId', 'jornadaId'],
        where: { kg: { gt: 0 }, jornada: { fecha: { lte: fechaD } } },
        _sum: { kg: true, monto: true },
      }),
      this.prisma.noPago.findMany({ where: { fecha: { lte: fechaD } } }),
    ]);

    const fechaJornada = new Map<number, string>(jornadas.map((j) => [j.id, iso(j.fecha)]));
    const jornadaHoy = jornadas.find((j) => iso(j.fecha) === fecha) ?? null;

    // Despachos de hoy por vuelta: quién repartió a cada cliente y cuántas entregas quedan sin guía
    const despachosHoy = jornadaHoy
      ? await this.prisma.despacho.findMany({
          where: { jornadaId: jornadaHoy.id, kg: { gt: 0 } },
          select: { clienteId: true, vuelta: true, repartidorId: true, guias: { where: { estado: 'VIGENTE' }, select: { id: true } } },
          orderBy: { vuelta: 'asc' },
        })
      : [];
    const repartioHoy = new Map<number, number | null>();
    for (const d of despachosHoy) if (!repartioHoy.has(d.clienteId)) repartioHoy.set(d.clienteId, d.repartidorId);

    // Cargos por cliente, en orden de fecha
    const cargosPorCliente = new Map<number, Cargo[]>();
    for (const g of grupos) {
      const f = fechaJornada.get(g.jornadaId);
      if (!f) continue;
      const lista = cargosPorCliente.get(g.clienteId) ?? [];
      lista.push({ fecha: f, kg: kg3(Number(g._sum.kg ?? 0)), monto: Math.round(Number(g._sum.monto ?? 0)) });
      cargosPorCliente.set(g.clienteId, lista);
    }
    const noPagoPorCliente = new Map<number, Map<string, string | null>>();
    for (const n of noPagos) {
      const m = noPagoPorCliente.get(n.clienteId) ?? new Map<string, string | null>();
      m.set(iso(n.fecha), n.nota);
      noPagoPorCliente.set(n.clienteId, m);
    }

    const repartidoresUsados = new Set<number>();
    const bloques = new Map<number, { cobros: FilaEntrega[]; noPagaron: FilaEntrega[]; pagaDespues: FilaEntrega[]; kgRepartidos: number }>();
    const bloque = (id: number) => {
      repartidoresUsados.add(id);
      if (!bloques.has(id)) bloques.set(id, { cobros: [], noPagaron: [], pagaDespues: [], kgRepartidos: 0 });
      return bloques.get(id)!;
    };
    const presenciales = { cobros: [] as FilaEntrega[], noPagaron: [] as FilaEntrega[] };
    const sinRepartidor: string[] = [];
    const pendientes: {
      clienteId: number;
      cliente: string;
      modalidad: ModalidadCliente;
      activo: boolean;
      kg: number;
      monto: number;
      desde: string;
      motivo: string;
    }[] = [];

    for (const c of clientes as ClienteInfo[]) {
      const cargos = (cargosPorCliente.get(c.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (cargos.length === 0) continue;
      const marcas = noPagoPorCliente.get(c.id) ?? new Map<string, string | null>();
      const diasConPan = cargos.map((x) => x.fecha);
      const esPDS = c.modalidad === 'PAGO_DIA_SIGUIENTE';

      // Día en que se cobra cada cargo: el primer día con pan (posterior, si es pago día siguiente) sin marca de "no pagó"
      const cobradoEl = (cargo: Cargo): string | null =>
        diasConPan.find((d) => (esPDS ? d > cargo.fecha : d >= cargo.fecha) && !marcas.has(d)) ?? null;
      const exigible = (cargo: Cargo) => (esPDS ? cargo.fecha < fecha : cargo.fecha <= fecha);

      const cobradosHoy = cargos.filter((x) => cobradoEl(x) === fecha);
      const impagos = cargos.filter((x) => exigible(x) && cobradoEl(x) === null);
      const trabajaHoy = diasConPan.includes(fecha);
      const marcaHoy = marcas.has(fecha);

      const fila = (lista: Cargo[]): FilaEntrega => ({
        clienteId: c.id,
        cliente: c.nombre,
        modalidad: c.modalidad,
        cargos: lista,
        kg: kg3(lista.reduce((t, x) => t + x.kg, 0)),
        monto: lista.reduce((t, x) => t + x.monto, 0),
        noPago: null,
      });

      if (trabajaHoy) {
        // Quién rinde lo que se cobra hoy a este cliente
        const repartidor = repartioHoy.get(c.id) ?? c.repartidorId;
        const cobrador = esPDS ? (jornadaHoy?.repartidorUnicoId ?? c.cobradorId ?? c.repartidorId) : repartidor;

        if (cobradosHoy.length > 0 || marcaHoy) {
          const f = marcaHoy ? { ...fila(impagos), noPago: { nota: marcas.get(fecha) ?? null } } : fila(cobradosHoy);
          if (f.cargos.length > 0) {
            if (c.modalidad === 'PRESENCIAL') (marcaHoy ? presenciales.noPagaron : presenciales.cobros).push(f);
            else if (cobrador === null) sinRepartidor.push(c.nombre);
            else (marcaHoy ? bloque(cobrador).noPagaron : bloque(cobrador).cobros).push(f);
          }
        }
        // Kg que repartió hoy cada repartidor (para el cuadre de kg) y lo que se cobra otro día
        const hoy = cargos.find((x) => x.fecha === fecha)!;
        if (c.modalidad !== 'PRESENCIAL' && repartidor !== null) {
          const b = bloque(repartidor);
          b.kgRepartidos = kg3(b.kgRepartidos + hoy.kg);
          if (esPDS) b.pagaDespues.push(fila([hoy]));
        }
      } else if (impagos.length > 0) {
        // No recibió pan hoy y tiene algo por cobrar: queda pendiente para su próximo día con pan
        const ultimaMarca = [...marcas.keys()].filter((d) => d <= fecha).sort().pop();
        pendientes.push({
          clienteId: c.id,
          cliente: c.nombre,
          modalidad: c.modalidad,
          activo: c.activo,
          kg: kg3(impagos.reduce((t, x) => t + x.kg, 0)),
          monto: impagos.reduce((t, x) => t + x.monto, 0),
          desde: impagos[0].fecha,
          motivo:
            ultimaMarca && ultimaMarca >= impagos[0].fecha
              ? `No pagó el ${ultimaMarca}${marcas.get(ultimaMarca) ? ': ' + marcas.get(ultimaMarca) : ''}`
              : `Sin recibir pan desde el ${diasConPan[diasConPan.length - 1]}`,
        });
      }
    }

    const repartidores = await this.prisma.repartidor.findMany({
      where: { id: { in: [...repartidoresUsados, ...(jornadaHoy?.repartidorUnicoId ? [jornadaHoy.repartidorUnicoId] : [])] } },
      select: { id: true, nombre: true, patente: true, pagaDiaria: true },
      orderBy: { nombre: 'asc' },
    });
    const pagasGuardadas = await this.prisma.pagaRepartidor.findMany({ where: { fecha: fechaD } });
    const pagaDe = new Map<number, number>(pagasGuardadas.map((p) => [p.repartidorId, Math.round(Number(p.monto))]));
    const sumar = (filas: FilaEntrega[], campo: 'kg' | 'monto') => kg3(filas.reduce((t, f) => t + f[campo], 0));

    const porRepartidor = repartidores
      .filter((r) => bloques.has(r.id))
      .map((r) => {
        const b = bloques.get(r.id)!;
        const montoEntregar = sumar(b.cobros, 'monto');
        // Paga del día: la anotada para esta fecha o, si no hay, la habitual (solo si repartió hoy)
        const guardada = pagaDe.get(r.id);
        const paga = guardada ?? (b.kgRepartidos > 0 ? Math.round(Number(r.pagaDiaria)) : 0);
        const repartidor: RepartidorRef = { id: r.id, nombre: r.nombre, patente: r.patente };
        const delDia = b.cobros.filter((f) => f.modalidad !== 'PAGO_DIA_SIGUIENTE');
        const diaAnterior = b.cobros.filter((f) => f.modalidad === 'PAGO_DIA_SIGUIENTE');
        return {
          repartidor,
          /** Clientes de reparto que pagaron hoy (incluye lo que arrastraban de días en que no pagaron) */
          cobrosDelDia: delDia,
          /** Clientes de pago día siguiente que pagaron hoy lo de su último día (o días) con pan */
          cobrosDiaAnterior: diaAnterior,
          noPagaron: b.noPagaron,
          /** Entregados hoy por este repartidor, se cobran el próximo día con pan */
          pagaDespues: b.pagaDespues,
          totales: {
            kgRepartidos: b.kgRepartidos,
            kgDelDia: sumar(delDia, 'kg'),
            kgDiaAnterior: sumar(diaAnterior, 'kg'),
            /** Lo cobrado a clientes */
            montoEntregar,
            montoNoPagado: sumar(b.noPagaron, 'monto'),
            /** Paga del repartidor ese día (se descuenta) */
            paga,
            /** false = es la paga habitual sugerida, aún no confirmada para este día */
            pagaGuardada: guardada !== undefined,
            /** Lo que efectivamente entrega: cobrado − paga */
            netoEntregar: montoEntregar - paga,
          },
        };
      });

    const repartidorUnico = jornadaHoy?.repartidorUnicoId
      ? (porRepartidor.find((p) => p.repartidor.id === jornadaHoy.repartidorUnicoId)?.repartidor ??
        repartidores.map((r) => ({ id: r.id, nombre: r.nombre, patente: r.patente })).find((r) => r.id === jornadaHoy.repartidorUnicoId) ??
        null)
      : null;
    const totalHoy = (cargosPorCliente: Map<number, Cargo[]>) => {
      let kg = 0;
      let monto = 0;
      for (const lista of cargosPorCliente.values()) {
        const h = lista.find((x) => x.fecha === fecha);
        if (h) {
          kg += h.kg;
          monto += h.monto;
        }
      }
      return { kg: kg3(kg), monto };
    };

    return {
      fecha,
      cerrada: jornadaHoy?.cerrada ?? false,
      repartidorUnico,
      repartidores: porRepartidor,
      presenciales: {
        cobros: presenciales.cobros,
        noPagaron: presenciales.noPagaron,
        totales: {
          kg: sumar(presenciales.cobros, 'kg'),
          monto: sumar(presenciales.cobros, 'monto'),
          montoNoPagado: sumar(presenciales.noPagaron, 'monto'),
        },
      },
      /** Por cobrar a clientes que hoy no recibieron pan */
      pendientes: pendientes.sort((a, b) => a.desde.localeCompare(b.desde)),
      /** Clientes de pago día siguiente sin repartidor ni cobrador asignado */
      sinRepartidor,
      totalesDia: {
        ...totalHoy(cargosPorCliente),
        montoEntregar: sumar([...porRepartidor.flatMap((r) => [...r.cobrosDelDia, ...r.cobrosDiaAnterior]), ...presenciales.cobros], 'monto'),
        pagas: porRepartidor.reduce((t, r) => t + r.totales.paga, 0),
        netoEntregar:
          sumar([...porRepartidor.flatMap((r) => [...r.cobrosDelDia, ...r.cobrosDiaAnterior]), ...presenciales.cobros], 'monto') -
          porRepartidor.reduce((t, r) => t + r.totales.paga, 0),
        sinGuia: despachosHoy.filter((d) => d.guias.length === 0).length,
      },
    };
  }

  /** Paga del repartidor en un día (se descuenta de lo que entrega) */
  async registrarPaga(fecha: string, repartidorId: number, monto: number, usuarioId?: number) {
    const r = await this.prisma.repartidor.findUnique({ where: { id: repartidorId }, select: { id: true, nombre: true } });
    if (!r) throw new NotFoundException('Repartidor no encontrado');
    const where = { fecha_repartidorId: { fecha: fechaDesdeISO(fecha), repartidorId } };
    const antes = await this.prisma.pagaRepartidor.findUnique({ where });
    const paga = await this.prisma.pagaRepartidor.upsert({
      where,
      update: { monto, creadoPorId: usuarioId ?? null },
      create: { fecha: fechaDesdeISO(fecha), repartidorId, monto, creadoPorId: usuarioId ?? null },
    });
    await this.audit.registrarCambio(
      usuarioId,
      antes ? 'ACTUALIZAR' : 'CREAR',
      'paga-repartidor',
      paga.id,
      antes ? { repartidor: r.nombre, fecha, monto: Number(antes.monto) } : null,
      { repartidor: r.nombre, fecha, monto },
    );
    return { repartidorId, fecha, monto };
  }

  /** El cliente recibió pan ese día pero no pagó: lo que debía pasa a su próximo día con pan */
  async marcarNoPago(fecha: string, clienteId: number, nota: string | null, usuarioId?: number) {
    if (fecha > hoySantiago()) throw new BadRequestException('No se puede marcar un día futuro');
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true, nombre: true } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const conPan = await this.prisma.despacho.count({
      where: { clienteId, kg: { gt: 0 }, jornada: { fecha: fechaDesdeISO(fecha) } },
    });
    if (conPan === 0) throw new BadRequestException(`${cliente.nombre} no recibió pan ese día`);

    const where = { clienteId_fecha: { clienteId, fecha: fechaDesdeISO(fecha) } };
    const antes = await this.prisma.noPago.findUnique({ where });
    const marca = await this.prisma.noPago.upsert({
      where,
      update: { nota, creadoPorId: usuarioId ?? null },
      create: { clienteId, fecha: fechaDesdeISO(fecha), nota, creadoPorId: usuarioId ?? null },
    });
    await this.audit.registrarCambio(usuarioId, antes ? 'ACTUALIZAR' : 'CREAR', 'no-pago', marca.id, antes, {
      cliente: cliente.nombre,
      fecha,
      nota,
    });
    return marca;
  }

  async quitarNoPago(fecha: string, clienteId: number, usuarioId?: number) {
    const where = { clienteId_fecha: { clienteId, fecha: fechaDesdeISO(fecha) } };
    const antes = await this.prisma.noPago.findUnique({ where });
    if (!antes) return { eliminado: false };
    await this.prisma.noPago.delete({ where });
    await this.audit.registrarCambio(usuarioId, 'ELIMINAR', 'no-pago', antes.id, antes, null);
    return { eliminado: true };
  }
}
