import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Rol } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { calcularMonto } from '../common/montos';
import { fechaDesdeISO } from '../common/utils';
import { PreciosService } from '../precios/precios.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrarLineaDto } from './dto/linea.dto';

export interface UsuarioAccion {
  id?: number;
  rol?: Rol;
}

/** Columnas del cuaderno: 1 = mañana, 2 = tarde 1, 3 = tarde 2 */
export const VUELTAS = [1, 2, 3] as const;

@Injectable()
export class PlanillaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly precios: PreciosService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Planilla de un día: todos los clientes activos (en el orden del cuaderno)
   * + los inactivos que tengan registro ese día, con sus 3 vueltas y la guía vigente de cada una.
   */
  async obtener(fecha: string) {
    const jornada = await this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaDesdeISO(fecha) } });

    const despachos = jornada
      ? await this.prisma.despacho.findMany({
          where: { jornadaId: jornada.id },
          include: { guias: { where: { estado: 'VIGENTE' }, select: { id: true, impresiones: true } } },
        })
      : [];
    const idsConRegistro = [...new Set(despachos.map((d) => d.clienteId))];

    const clientes = await this.prisma.cliente.findMany({
      where: { OR: [{ activo: true }, { id: { in: idsConRegistro } }] },
      include: { repartidor: { select: { id: true, nombre: true } } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });

    const general = await this.precios.vigente(fecha);

    return {
      fecha,
      jornada: jornada
        ? { id: jornada.id, cerrada: jornada.cerrada, cerradaEn: jornada.cerradaEn, repartidorUnicoId: jornada.repartidorUnicoId }
        : { id: null, cerrada: false, cerradaEn: null, repartidorUnicoId: null },
      precioGeneral: general?.valor ?? null,
      filas: clientes.map((c) => ({
        cliente: c,
        /** Precio que se aplicaría hoy (el de una línea guardada puede diferir si cambió después) */
        precioKgAplicable: c.precioKgEspecial ?? general?.valor ?? null,
        vueltas: VUELTAS.map((v) => {
          const d = despachos.find((x) => x.clienteId === c.id && x.vuelta === v);
          if (!d) return { vuelta: v, despacho: null, guia: null };
          const { guias, ...despacho } = d;
          return { vuelta: v, despacho, guia: guias[0] ?? null };
        }),
      })),
    };
  }

  /** Registra o corrige los kg de un cliente en una vuelta del día */
  async registrarLinea(
    fecha: string,
    clienteId: number,
    vuelta: number,
    dto: RegistrarLineaDto,
    usuario: UsuarioAccion,
  ) {
    if (!VUELTAS.includes(vuelta as 1 | 2 | 3)) throw new BadRequestException('La vuelta debe ser 1, 2 o 3');

    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const jornada = await this.prisma.jornadaDespacho.upsert({
      where: { fecha: fechaDesdeISO(fecha) },
      update: {},
      create: { fecha: fechaDesdeISO(fecha) },
    });
    this.validarAbierta(jornada.cerrada, usuario);

    const lineasDelDia = await this.prisma.despacho.findMany({
      where: { jornadaId: jornada.id, clienteId },
      include: { guias: true },
    });
    const existente = lineasDelDia.find((l) => l.vuelta === vuelta);

    if (!existente && !cliente.activo) {
      throw new BadRequestException('El cliente está desactivado');
    }
    const guiaVigente = existente?.guias.find((g) => g.estado === 'VIGENTE');
    if (guiaVigente) {
      throw new ConflictException(
        `Esta vuelta ya tiene la guía N° ${guiaVigente.id} emitida. Para corregir los kg, primero anule la guía.`,
      );
    }

    // kg = 0: el cliente no lleva pan en esa vuelta
    if (dto.kg === 0) {
      if (!existente) return { eliminado: true };
      if (existente.guias.length === 0) {
        await this.prisma.despacho.delete({ where: { id: existente.id } });
      } else {
        // Tiene guías anuladas asociadas: se conserva la línea en 0 por trazabilidad
        await this.prisma.despacho.update({
          where: { id: existente.id },
          data: { kg: 0, kgDescuento: 0, monto: 0, creadoPorId: usuario.id },
        });
      }
      await this.audit.registrarCambio(usuario.id, 'ACTUALIZAR', 'despacho', existente.id,
        { vuelta, kg: existente.kg, monto: existente.monto }, { vuelta, kg: 0 });
      // Si esta vuelta llevaba el descuento diario, pasa a otra vuelta del día
      await this.redistribuirDescuento(jornada.id, clienteId);
      return { eliminado: true };
    }

    const precio = cliente.precioKgEspecial ?? (await this.precios.vigente(fecha))?.valor;
    if (precio === undefined || precio === null) {
      throw new BadRequestException('No hay un precio del kg vigente para esta fecha. Defínalo en "Precio del kg".');
    }

    // El descuento diario (ej. Suegra 1 kg) se aplica una sola vez al día
    const otraVueltaConDescuento = lineasDelDia.some(
      (l) => l.vuelta !== vuelta && Number(l.kgDescuento) > 0 && Number(l.kg) > 0,
    );
    const kgDescuento = otraVueltaConDescuento ? 0 : cliente.kgDescuentoDiario;

    const datos = {
      kg: dto.kg,
      kgDescuento,
      precioKg: precio,
      monto: calcularMonto(dto.kg, kgDescuento, precio),
      // Si hoy reparte uno solo, todo lo de reparto queda a su nombre
      repartidorId: cliente.modalidad === 'PRESENCIAL' ? null : (jornada.repartidorUnicoId ?? cliente.repartidorId),
      creadoPorId: usuario.id ?? null,
    };

    const guardado = await this.prisma.despacho.upsert({
      where: { jornadaId_clienteId_vuelta: { jornadaId: jornada.id, clienteId, vuelta } },
      update: datos,
      create: { ...datos, jornadaId: jornada.id, clienteId, vuelta },
    });

    await this.audit.registrarCambio(
      usuario.id,
      existente ? 'ACTUALIZAR' : 'CREAR',
      'despacho',
      guardado.id,
      existente ? { vuelta, kg: existente.kg, precioKg: existente.precioKg, monto: existente.monto } : null,
      guardado,
    );
    return guardado;
  }

  /**
   * Si ninguna vuelta del día lleva el descuento diario del cliente, se asigna
   * a la primera vuelta con pan que aún no tenga guía emitida.
   */
  private async redistribuirDescuento(jornadaId: number, clienteId: number) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente || Number(cliente.kgDescuentoDiario) <= 0) return;

    const lineas = await this.prisma.despacho.findMany({
      where: { jornadaId, clienteId, kg: { gt: 0 } },
      include: { guias: { where: { estado: 'VIGENTE' } } },
      orderBy: { vuelta: 'asc' },
    });
    if (lineas.some((l) => Number(l.kgDescuento) > 0)) return;

    const candidata = lineas.find((l) => l.guias.length === 0);
    if (!candidata) return;
    await this.prisma.despacho.update({
      where: { id: candidata.id },
      data: {
        kgDescuento: cliente.kgDescuentoDiario,
        monto: calcularMonto(candidata.kg, cliente.kgDescuentoDiario, candidata.precioKg),
      },
    });
  }

  /**
   * Indica que ese día un solo repartidor hizo todo el reparto (null = cada uno el suyo).
   * Las líneas ya anotadas pasan a su nombre, y en la Entrega del día rinde también todo lo de pago día siguiente.
   */
  async asignarRepartidorUnico(fecha: string, repartidorId: number | null, usuario: UsuarioAccion) {
    if (repartidorId !== null) {
      const r = await this.prisma.repartidor.findUnique({ where: { id: repartidorId } });
      if (!r || !r.activo) throw new BadRequestException('El repartidor seleccionado no existe o está inactivo');
    }
    const existente = await this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaDesdeISO(fecha) } });
    if (existente) this.validarAbierta(existente.cerrada, usuario);
    const antes = existente?.repartidorUnicoId ?? null;

    const jornada = await this.prisma.$transaction(async (tx) => {
      const j = await tx.jornadaDespacho.upsert({
        where: { fecha: fechaDesdeISO(fecha) },
        update: { repartidorUnicoId: repartidorId },
        create: { fecha: fechaDesdeISO(fecha), repartidorUnicoId: repartidorId },
      });
      const lineas = await tx.despacho.findMany({
        where: { jornadaId: j.id, cliente: { modalidad: { not: 'PRESENCIAL' } } },
        select: { id: true, repartidorId: true, cliente: { select: { repartidorId: true } } },
      });
      for (const l of lineas) {
        const nuevo = repartidorId ?? l.cliente.repartidorId;
        if (l.repartidorId !== nuevo) await tx.despacho.update({ where: { id: l.id }, data: { repartidorId: nuevo } });
      }
      return j;
    });

    const guiasEmitidas = await this.prisma.guia.count({ where: { fecha: fechaDesdeISO(fecha), estado: 'VIGENTE' } });
    await this.audit.registrarCambio(usuario.id, 'ACTUALIZAR', 'jornada', jornada.id, { repartidorUnicoId: antes }, { repartidorUnicoId: repartidorId });
    return { repartidorUnicoId: jornada.repartidorUnicoId, guiasEmitidas };
  }

  /** Cierra el día: la planilla queda bloqueada (solo ADMIN puede corregir) */
  async cerrar(fecha: string, usuario: UsuarioAccion) {
    const jornada = await this.prisma.jornadaDespacho.upsert({
      where: { fecha: fechaDesdeISO(fecha) },
      update: { cerrada: true, cerradaEn: new Date(), cerradaPorId: usuario.id ?? null },
      create: { fecha: fechaDesdeISO(fecha), cerrada: true, cerradaEn: new Date(), cerradaPorId: usuario.id ?? null },
    });
    await this.audit.registrar({ usuarioId: usuario.id, accion: 'CERRAR_DIA', recurso: `jornada/${fecha}` });
    return jornada;
  }

  async reabrir(fecha: string, usuario: UsuarioAccion) {
    const jornada = await this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaDesdeISO(fecha) } });
    if (!jornada) throw new NotFoundException('No hay planilla para esa fecha');
    const actualizada = await this.prisma.jornadaDespacho.update({
      where: { id: jornada.id },
      data: { cerrada: false, cerradaEn: null, cerradaPorId: null },
    });
    await this.audit.registrar({ usuarioId: usuario.id, accion: 'REABRIR_DIA', recurso: `jornada/${fecha}` });
    return actualizada;
  }

  private validarAbierta(cerrada: boolean, usuario: UsuarioAccion) {
    if (cerrada && usuario.rol !== 'ADMIN') {
      throw new ConflictException('El día está cerrado. Solo el administrador puede corregirlo.');
    }
  }
}
