import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, normalizarRut, rutValido } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarProveedorDto, CrearProveedorDto } from './dto/proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(incluirInactivos = false) {
    return this.prisma.proveedor.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      include: { _count: { select: { facturas: true } } },
      orderBy: [{ activo: 'desc' }, { razonSocial: 'asc' }],
    });
  }

  async obtener(id: number) {
    const p = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
    return p;
  }

  async crear(dto: CrearProveedorDto, usuarioId?: number) {
    try {
      const creado = await this.prisma.proveedor.create({
        data: {
          rut: this.prepararRut(dto.rut),
          razonSocial: dto.razonSocial,
          contacto: dto.contacto ?? null,
          telefono: dto.telefono ?? null,
          email: dto.email?.toLowerCase() ?? null,
        },
      });
      await this.audit.registrarCambio(usuarioId, 'CREAR', 'proveedor', creado.id, null, creado);
      return creado;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException('Ya existe un proveedor con ese RUT');
      throw e;
    }
  }

  async actualizar(id: number, dto: ActualizarProveedorDto, usuarioId?: number) {
    const antes = await this.obtener(id);
    try {
      const despues = await this.prisma.proveedor.update({
        where: { id },
        data: {
          rut: dto.rut === undefined ? undefined : this.prepararRut(dto.rut),
          razonSocial: dto.razonSocial,
          contacto: dto.contacto,
          telefono: dto.telefono,
          email: dto.email === undefined ? undefined : (dto.email?.toLowerCase() ?? null),
          activo: dto.activo,
        },
      });
      const accion =
        dto.activo === false && antes.activo
          ? 'DESACTIVAR'
          : dto.activo === true && !antes.activo
            ? 'REACTIVAR'
            : 'ACTUALIZAR';
      await this.audit.registrarCambio(usuarioId, accion, 'proveedor', id, antes, despues);
      return despues;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException('Ya existe un proveedor con ese RUT');
      throw e;
    }
  }

  /** Eliminación lógica: conserva sus facturas */
  desactivar(id: number, usuarioId?: number) {
    return this.actualizar(id, { activo: false }, usuarioId);
  }

  private prepararRut(rut: string | null | undefined): string {
    if (!rut || !rutValido(rut)) throw new BadRequestException('El RUT no es válido');
    return normalizarRut(rut);
  }
}
