import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, normalizarRut, rutValido } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarRepartidorDto, CrearRepartidorDto } from './dto/repartidor.dto';

@Injectable()
export class RepartidoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(incluirInactivos = false) {
    return this.prisma.repartidor.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      include: { _count: { select: { clientes: { where: { activo: true } } } } },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async obtener(id: number) {
    const r = await this.prisma.repartidor.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Repartidor no encontrado');
    return r;
  }

  async crear(dto: CrearRepartidorDto, usuarioId?: number) {
    try {
      const creado = await this.prisma.repartidor.create({
        data: {
          nombre: dto.nombre,
          rut: this.prepararRut(dto.rut),
          patente: dto.patente?.toUpperCase() ?? null,
        },
      });
      await this.audit.registrarCambio(usuarioId, 'CREAR', 'repartidor', creado.id, null, creado);
      return creado;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException('Ya existe un repartidor con ese RUT');
      throw e;
    }
  }

  async actualizar(id: number, dto: ActualizarRepartidorDto, usuarioId?: number) {
    const antes = await this.obtener(id);

    if (dto.activo === false && antes.activo) {
      await this.validarSinClientesActivos(id);
    }

    try {
      const despues = await this.prisma.repartidor.update({
        where: { id },
        data: {
          nombre: dto.nombre ?? undefined,
          rut: dto.rut === undefined ? undefined : this.prepararRut(dto.rut),
          patente: dto.patente === undefined ? undefined : (dto.patente?.toUpperCase() ?? null),
          activo: dto.activo,
        },
      });
      const accion =
        dto.activo === false && antes.activo
          ? 'DESACTIVAR'
          : dto.activo === true && !antes.activo
            ? 'REACTIVAR'
            : 'ACTUALIZAR';
      await this.audit.registrarCambio(usuarioId, accion, 'repartidor', id, antes, despues);
      return despues;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException('Ya existe un repartidor con ese RUT');
      throw e;
    }
  }

  /** Eliminación lógica: el repartidor conserva su historial de despachos y guías */
  desactivar(id: number, usuarioId?: number) {
    return this.actualizar(id, { activo: false }, usuarioId);
  }

  private prepararRut(rut: string | null | undefined): string | null {
    if (!rut) return null;
    if (!rutValido(rut)) throw new BadRequestException('El RUT no es válido');
    return normalizarRut(rut);
  }

  private async validarSinClientesActivos(id: number) {
    const clientes = await this.prisma.cliente.count({ where: { repartidorId: id, activo: true } });
    if (clientes > 0) {
      throw new ConflictException(
        `No se puede desactivar: tiene ${clientes} cliente(s) activo(s) asignado(s). Reasígnelos primero.`,
      );
    }
  }
}
