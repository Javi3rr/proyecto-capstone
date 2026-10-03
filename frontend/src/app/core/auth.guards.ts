import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Rol } from './models';

/** Exige sesión iniciada */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? true : inject(Router).createUrlTree(['/login']);
};

/** Para la pantalla de login: si ya hay sesión, va directo a su inicio */
export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? inject(Router).parseUrl(auth.rutaInicio()) : true;
};

/** Restringe por rol (ADMIN siempre tiene acceso) */
export const rolGuard =
  (...roles: Rol[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.autenticado()) return router.createUrlTree(['/login']);
    return auth.tieneRol(...roles) ? true : router.createUrlTree(['/no-autorizado']);
  };
