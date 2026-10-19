import { SetMetadata } from '@nestjs/common';
import type { Rol } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe un controlador o endpoint a ciertos roles.
 * El rol ADMIN siempre tiene acceso.
 * Ej: @Roles('DESPACHO')
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
