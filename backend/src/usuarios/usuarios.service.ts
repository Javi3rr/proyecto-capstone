import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './dto/usuario.dto';

/** Campos que se pueden mostrar (nunca el hash de la contraseña) */
const CAMPOS_PUBLICOS = {
  id: true,
  username: true,
  nombre: true,
  rol: true,
  codigo: true,
  activo: true,
  ultimoAcceso: true,
  creadoEn: true,
  actualizadoEn: true,
} as const;

/**
 * Gestión de usuarios (solo administrador).
 * - Las contraseñas se guardan con bcrypt.
 * - Desactivar, cambiar el rol o restablecer la contraseña cierra las sesiones abiertas del usuario.
 * - Siempre debe quedar al menos un administrador activo, y nadie puede desactivarse ni quitarse el rol a sí mismo.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar() {
    return this.prisma.usuario.findMany({
      select: CAMPOS_PUBLICOS,
      orderBy: [{ activo: 'desc' }, { rol: 'asc' }, { username: 'asc' }],
    });
  }

  async obtener(id: number) {
    const u = await this.prisma.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  async crear(dto: CrearUsuarioDto, adminId?: number) {
    try {
      const creado = await this.prisma.usuario.create({
        data: {
          username: dto.username,
          nombre: dto.nombre,
          rol: dto.rol,
          codigo: dto.codigo ?? null,
          passwordHash: await bcrypt.hash(dto.password, 10),
        },
        select: CAMPOS_PUBLICOS,
      });
      await this.audit.registrarCambio(adminId, 'CREAR', 'usuario', creado.id, null, creado);
      return creado;
    } catch (e) {
      throw this.traducirUnico(e);
    }
  }

  async actualizar(id: number, dto: ActualizarUsuarioDto, adminId?: number) {
    const antes = await this.obtener(id);

    if (id === adminId) {
      if (dto.activo === false) throw new BadRequestException('No puede desactivar su propio usuario');
      if (dto.rol && dto.rol !== antes.rol) throw new BadRequestException('No puede cambiar su propio rol');
    }
    const dejaDeSerAdminActivo =
      antes.rol === 'ADMIN' && antes.activo && (dto.activo === false || (dto.rol !== undefined && dto.rol !== 'ADMIN'));
    if (dejaDeSerAdminActivo) await this.validarOtroAdmin(id);

    // Cambios que obligan a volver a iniciar sesión
    const cierraSesiones =
      (dto.activo === false && antes.activo) || (dto.rol !== undefined && dto.rol !== antes.rol);

    try {
      const despues = await this.prisma.usuario.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          rol: dto.rol,
          codigo: dto.codigo,
          activo: dto.activo,
          tokenVersion: cierraSesiones ? { increment: 1 } : undefined,
        },
        select: CAMPOS_PUBLICOS,
      });
      const accion =
        dto.activo === false && antes.activo
          ? 'DESACTIVAR'
          : dto.activo === true && !antes.activo
            ? 'REACTIVAR'
            : 'ACTUALIZAR';
      await this.audit.registrarCambio(adminId, accion, 'usuario', id, antes, despues);
      return despues;
    } catch (e) {
      throw this.traducirUnico(e);
    }
  }

  /** El administrador asigna una contraseña nueva (p. ej. si el usuario la olvidó) */
  async restablecerClave(id: number, password: string, adminId?: number) {
    await this.obtener(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10), tokenVersion: { increment: 1 } },
    });
    // Nunca se registra la contraseña, solo el hecho
    await this.audit.registrar({ usuarioId: adminId, accion: 'RESTABLECER_CLAVE', recurso: `usuario/${id}` });
    return { ok: true };
  }

  /** Cierra todas las sesiones abiertas de un usuario sin cambiar su contraseña */
  async cerrarSesiones(id: number, adminId?: number) {
    await this.obtener(id);
    await this.prisma.usuario.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    await this.audit.registrar({ usuarioId: adminId, accion: 'CERRAR_SESIONES', recurso: `usuario/${id}` });
    return { ok: true };
  }

  private async validarOtroAdmin(id: number) {
    const otros = await this.prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, id: { not: id } } });
    if (otros === 0) throw new BadRequestException('Debe quedar al menos un administrador activo');
  }

  private traducirUnico(e: unknown) {
    if (esErrorUnico(e)) {
      const campos = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
      return new ConflictException(
        campos.includes('codigo') ? 'Ese código de mesonera ya está asignado a otro usuario' : 'Ese nombre de usuario ya existe',
      );
    }
    return e;
  }
}
