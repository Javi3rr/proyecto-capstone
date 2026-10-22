import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ModalidadCliente, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, normalizarRut, rutValido } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarClienteDto, CrearClienteDto } from './dto/cliente.dto';

export interface FiltroClientes {
  incluirInactivos?: boolean;
  modalidad?: ModalidadCliente;
  buscar?: string;
}

const INCLUDE_REPARTIDOR = {
  repartidor: { select: { id: true, nombre: true } },
  cobrador: { select: { id: true, nombre: true } },
} as const;

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Clientes en el orden de la planilla (igual al cuaderno) */
  listar(filtro: FiltroClientes = {}) {
    return this.prisma.cliente.findMany({
      where: {
        activo: filtro.incluirInactivos ? undefined : true,
        modalidad: filtro.modalidad,
        nombre: filtro.buscar ? { contains: filtro.buscar.trim(), mode: 'insensitive' } : undefined,
      },
      include: INCLUDE_REPARTIDOR,
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async obtener(id: number) {
    const c = await this.prisma.cliente.findUnique({ where: { id }, include: INCLUDE_REPARTIDOR });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return c;
  }

  async crear(dto: CrearClienteDto, usuarioId?: number) {
    const repartidorId = await this.resolverRepartidor(dto.modalidad, dto.repartidorId);
    const cobradorId = await this.resolverCobrador(dto.modalidad, dto.cobradorId);
    const orden = dto.orden ?? (await this.siguienteOrden(dto.modalidad));

    try {
      const creado = await this.prisma.cliente.create({
        data: {
          nombre: dto.nombre,
          modalidad: dto.modalidad,
          repartidorId,
          cobradorId,
          direccion: dto.direccion ?? null,
          telefono: dto.telefono ?? null,
          rut: this.prepararRut(dto.rut),
          razonSocial: dto.razonSocial ?? null,
          giro: dto.giro ?? null,
          comuna: dto.comuna ?? null,
          orden,
          precioKgEspecial: dto.precioKgEspecial ?? null,
          kgDescuentoDiario: dto.kgDescuentoDiario ?? 0,
        },
        include: INCLUDE_REPARTIDOR,
      });
      await this.audit.registrarCambio(usuarioId, 'CREAR', 'cliente', creado.id, null, creado);
      return creado;
    } catch (e) {
      throw this.traducirError(e, dto.nombre);
    }
  }

  async actualizar(id: number, dto: ActualizarClienteDto, usuarioId?: number) {
    const antes = await this.obtener(id);

    // La regla del repartidor se valida con los valores finales (los nuevos o los actuales)
    const modalidad = dto.modalidad ?? antes.modalidad;
    const repartidorPedido = dto.repartidorId !== undefined ? dto.repartidorId : antes.repartidorId;
    const repartidorId = await this.resolverRepartidor(modalidad, repartidorPedido);
    const cobradorId = await this.resolverCobrador(modalidad, dto.cobradorId !== undefined ? dto.cobradorId : antes.cobradorId);

    const data: Prisma.ClienteUncheckedUpdateInput = {
      nombre: dto.nombre ?? undefined,
      modalidad,
      repartidorId,
      cobradorId,
      direccion: dto.direccion,
      telefono: dto.telefono,
      rut: dto.rut === undefined ? undefined : this.prepararRut(dto.rut),
      razonSocial: dto.razonSocial,
      giro: dto.giro,
      comuna: dto.comuna,
      orden: dto.orden,
      precioKgEspecial: dto.precioKgEspecial,
      kgDescuentoDiario: dto.kgDescuentoDiario,
      activo: dto.activo,
    };

    try {
      const despues = await this.prisma.cliente.update({ where: { id }, data, include: INCLUDE_REPARTIDOR });
      const accion =
        dto.activo === false && antes.activo
          ? 'DESACTIVAR'
          : dto.activo === true && !antes.activo
            ? 'REACTIVAR'
            : 'ACTUALIZAR';
      await this.audit.registrarCambio(usuarioId, accion, 'cliente', id, antes, despues);
      return despues;
    } catch (e) {
      throw this.traducirError(e, dto.nombre ?? antes.nombre);
    }
  }

  /** Eliminación lógica: el cliente conserva su historial de despachos y guías */
  desactivar(id: number, usuarioId?: number) {
    return this.actualizar(id, { activo: false }, usuarioId);
  }

  /**
   * Reglas del cuaderno:
   * - PRESENCIAL: sin repartidor (lo atiende el despachador)
   * - REPARTO y PAGO_DIA_SIGUIENTE: requieren un repartidor activo
   */
  private async resolverRepartidor(modalidad: ModalidadCliente, repartidorId?: number | null): Promise<number | null> {
    if (modalidad === 'PRESENCIAL') return null;
    if (!repartidorId) {
      throw new BadRequestException('Debe asignar un repartidor para clientes de reparto o pago día siguiente');
    }
    const r = await this.prisma.repartidor.findUnique({ where: { id: repartidorId } });
    if (!r || !r.activo) throw new BadRequestException('El repartidor seleccionado no existe o está inactivo');
    return r.id;
  }

  /** RUT opcional: se guarda como 12345678-9 y se valida el dígito verificador */
  private prepararRut(rut?: string | null): string | null {
    if (!rut) return null;
    if (!rutValido(rut)) throw new BadRequestException(`El RUT ${rut} no es válido`);
    return normalizarRut(rut);
  }

  /** Cobrador del pago día siguiente: solo aplica a esa modalidad (null = el mismo que reparte) */
  private async resolverCobrador(modalidad: ModalidadCliente, cobradorId?: number | null): Promise<number | null> {
    if (modalidad !== 'PAGO_DIA_SIGUIENTE' || !cobradorId) return null;
    const r = await this.prisma.repartidor.findUnique({ where: { id: cobradorId } });
    if (!r || !r.activo) throw new BadRequestException('El cobrador seleccionado no existe o está inactivo');
    return r.id;
  }

  private async siguienteOrden(modalidad: ModalidadCliente): Promise<number> {
    const max = await this.prisma.cliente.aggregate({ where: { modalidad }, _max: { orden: true } });
    return (max._max.orden ?? 0) + 10;
  }

  private traducirError(e: unknown, nombre: string): unknown {
    if (esErrorUnico(e)) {
      return new ConflictException(`Ya existe un cliente llamado "${nombre}" en esa modalidad`);
    }
    return e;
  }
}
