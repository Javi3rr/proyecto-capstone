import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthRequest, JwtPayload } from '../auth.types';

/** Inyecta el usuario autenticado: metodo(@CurrentUser() user: JwtPayload) */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined =>
    ctx.switchToHttp().getRequest<AuthRequest>().user,
);
