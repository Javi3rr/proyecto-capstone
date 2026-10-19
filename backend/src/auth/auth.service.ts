import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import type { JwtPayload } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string) {
    const username = dto.username.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { username } });

    const valido =
      !!usuario && usuario.activo && (await bcrypt.compare(dto.password, usuario.passwordHash));

    if (!usuario || !valido) {
      await this.audit.registrar({
        usuarioId: usuario?.id,
        accion: 'LOGIN_FALLIDO',
        recurso: '/api/auth/login',
        estadoHttp: 401,
        detalle: { username },
        ip,
      });
      // Mensaje genérico: no revela si falló el usuario o la contraseña
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    await this.prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: new Date() } });

    await this.audit.registrar({
      usuarioId: usuario.id,
      accion: 'LOGIN',
      recurso: '/api/auth/login',
      estadoHttp: 200,
      ip,
    });

    return this.emitirSesion(usuario);
  }

  /** Cambio de contraseña del propio usuario. Cierra sus otras sesiones y devuelve una nueva. */
  async cambiarClave(usuarioId: number, actual: string, nueva: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || !usuario.activo) throw new NotFoundException('Usuario no encontrado');
    // 400 (no 401) para que el frontend no cierre la sesión por un error de tipeo
    if (!(await bcrypt.compare(actual, usuario.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (actual === nueva) throw new BadRequestException('La nueva contraseña debe ser distinta a la actual');

    const actualizado = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { passwordHash: await bcrypt.hash(nueva, 10), tokenVersion: { increment: 1 } },
    });
    await this.audit.registrar({ usuarioId, accion: 'CAMBIAR_CLAVE', recurso: `usuario/${usuarioId}` });
    return this.emitirSesion(actualizado);
  }

  private async emitirSesion(usuario: { id: number; username: string; nombre: string; rol: JwtPayload['rol']; tokenVersion: number }) {
    const payload: JwtPayload = {
      sub: usuario.id,
      username: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      ver: usuario.tokenVersion,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.rol },
    };
  }

  async perfil(usuarioId: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, username: true, nombre: true, rol: true, codigo: true, activo: true },
    });
    if (!usuario || !usuario.activo) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }
}
