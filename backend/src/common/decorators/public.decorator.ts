import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como accesible sin iniciar sesión (ej. login, health) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
