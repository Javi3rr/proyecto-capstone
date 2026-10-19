import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthRequest, JwtPayload } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Guard global: exige un token válido salvo en endpoints marcados con @Public() */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Debe iniciar sesión');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    // El usuario debe seguir activo y su sesión no debe haber sido cerrada por el administrador
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { activo: true, rol: true, nombre: true, tokenVersion: true },
    });
    if (!usuario || !usuario.activo || usuario.tokenVersion !== (payload.ver ?? 0)) {
      throw new UnauthorizedException('Su sesión fue cerrada. Inicie sesión nuevamente.');
    }
    // Rol y nombre siempre desde la base de datos (por si cambiaron)
    request.user = { ...payload, rol: usuario.rol, nombre: usuario.nombre };
    return true;
  }
}
