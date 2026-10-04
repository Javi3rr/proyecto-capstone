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

@Injectable()
export class PlanillaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly precios: PreciosService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Planilla de un día: todos los clientes activos (en el orden del cuaderno)
   * + los inactivos que tengan registro ese día, con su línea y guía vigente.
   */
  async obtener(fecha: string) {
    const jornada = await this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaDesdeISO(fecha) } });

    const despachos = jornada
      ? await this.prisma.despacho.findMany({
          where: { jornadaId: jornada.id },
          include: { guias: { where: { estado: 'VIGENTE' }, select: { id: true, impresiones: true } } },
        })
      : [];
    const porCliente = new Map(despachos.map((d) => [d.clienteId, d]));

    const clientes = await this.prisma.cliente.findMany({
      where: { OR: [{ activo: true }, { id: { in: [...porCliente.keys()] } }] },
      include: { repartidor: { select: { id: true, nombre: true } } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });

    const general = await this.precios.vigente(fecha);

    return {
      fecha,
      jornada: jornada
        ? { id: jornada.id, cerrada: jornada.cerrada, cerradaEn: jornada.cerradaEn }
        : { id: null, cerrada: false, cerradaEn: null },
      precioGeneral: general?.valor ?? null,
      filas: clientes.map((c) => {
        const d = porCliente.get(c.id);
        let despacho = null;
        let guia = null;
        if (d) {
          const { guias, ...resto } = d;
          despacho = resto;
          guia = guias[0] ?? null;
        }
        return {
          cliente: c,
          /** Precio que se aplicaría hoy (el de la línea guardada puede diferir si cambió después) */
          precioKgAplicable: c.precioKgEspecial ?? general?.valor ?? null,
          despacho,
          guia,
        };
      }),
    };
  }

  /** Registra o corrige la línea de un cliente (total de kg del día) */
  async registrarLinea(fecha: string, clienteId: number, dto: RegistrarLineaDto, usuario: UsuarioAccion) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const jornada = await this.prisma.jornadaDespacho.upsert({
      where: { fecha: fechaDesdeISO(fecha) },
      update: {},
      create: { fecha: fechaDesdeISO(fecha) },
    });
    this.validarAbierta(jornada.cerrada, usuario);

    const existente = await this.prisma.despacho.findUnique({
      where: { jornadaId_clienteId: { jornadaId: jornada.id, clienteId } },
      include: { guias: true },
    });

    if (!existente && !cliente.activo) {
      throw new BadRequestException('El cliente está desactivado');
    }
    const guiaVigente = existente?.guias.find((g) => g.estado === 'VIGENTE');
    if (guiaVigente) {
      throw new ConflictException(
        `Este cliente ya tiene la guía N° ${guiaVigente.id} emitida. Para corregir los kg, primero anule la guía.`,
      );
    }

    // kg = 0: el cliente no lleva pan ese día
    if (dto.kg === 0) {
      if (!existente) return { eliminado: true };
      if (existente.guias.length === 0) {
        await this.prisma.despacho.delete({ where: { id: existente.id } });
      } else {
        // Tiene guías anuladas asociadas: se conserva la línea en 0 por trazabilidad
        await this.prisma.despacho.update({
          where: { id: existente.id },
          data: { kg: 0, monto: 0, creadoPorId: usuario.id },
        });
      }
      await this.audit.registrarCambio(usuario.id, 'ACTUALIZAR', 'despacho', existente.id, existente, { kg: 0 });
      return { eliminado: true };
    }

    const precio = cliente.precioKgEspecial ?? (await this.precios.vigente(fecha))?.valor;
    if (precio === undefined || precio === null) {
      throw new BadRequestException('No hay un precio del kg vigente para esta fecha. Defínalo en "Precio del kg".');
    }

    const datos = {
      kg: dto.kg,
      kgDescuento: cliente.kgDescuentoDiario,
      precioKg: precio,
      monto: calcularMonto(dto.kg, cliente.kgDescuentoDiario, precio),
      repartidorId: cliente.repartidorId,
      creadoPorId: usuario.id ?? null,
    };

    const guardado = await this.prisma.despacho.upsert({
      where: { jornadaId_clienteId: { jornadaId: jornada.id, clienteId } },
      update: datos,
      create: { ...datos, jornadaId: jornada.id, clienteId },
    });

    await this.audit.registrarCambio(
      usuario.id,
      existente ? 'ACTUALIZAR' : 'CREAR',
      'despacho',
      guardado.id,
      existente ? { kg: existente.kg, precioKg: existente.precioKg, monto: existente.monto } : null,
      guardado,
    );
    return guardado;
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
