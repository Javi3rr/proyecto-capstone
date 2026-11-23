import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsCl from '@angular/common/locales/es-CL';
import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { NavigationError, provideRouter, withComponentInputBinding, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

// Fechas, números y montos en formato chileno (ej. $12.500, 03-10-2026)
registerLocaleData(localeEsCl);

/** Marca para no recargar en bucle si la pantalla de verdad no carga (por ejemplo, sin conexión) */
const CLAVE_RECARGA = 'patopan-recarga-version';

/**
 * Después de una actualización del sistema, una pestaña que quedó abierta todavía pide los archivos de la versión
 * anterior, que ya no existen: la pantalla no abre y no se ve ningún error. En ese caso se recarga la página una vez
 * en la dirección a la que se quería ir, para tomar la versión nueva.
 */
function recargarSiCambioLaVersion(e: NavigationError): void {
  const texto = String((e.error as Error | undefined)?.message ?? e.error);
  const faltaArchivo = /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(texto);
  if (!faltaArchivo) return;
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0);
    if (Date.now() - ultima < 10_000) return;
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()));
  } catch {
    // Sin sessionStorage se recarga igual
  }
  window.location.assign(e.url);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withNavigationErrorHandler(recargarSiCambioLaVersion)),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-CL' },
  ],
};
