import { HttpErrorResponse } from '@angular/common/http';

/** Extrae un mensaje legible de un error de la API (NestJS) */
export function mensajeError(e: unknown, porDefecto = 'Ocurrió un error. Intente nuevamente.'): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No se pudo conectar con el servidor.';
    const msg: unknown = e.error?.message;
    if (Array.isArray(msg)) return msg.join(' · ');
    if (typeof msg === 'string') return msg;
  }
  return porDefecto;
}
