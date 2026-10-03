import type { Request } from 'express';
import type { Rol } from '@prisma/client';

/** Contenido del token JWT */
export interface JwtPayload {
  sub: number;
  username: string;
  nombre: string;
  rol: Rol;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
