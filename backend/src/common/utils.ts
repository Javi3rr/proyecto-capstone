import { Prisma } from '@prisma/client';

/** Fecha de hoy (YYYY-MM-DD) en hora de Chile */
export function hoySantiago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

/** Convierte 'YYYY-MM-DD' en un Date para columnas @db.Date */
export function fechaDesdeISO(fecha: string): Date {
  return new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
}

/** true si el error de Prisma corresponde a una restricción UNIQUE */
export function esErrorUnico(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** Normaliza un RUT chileno a "12345678-9" (sin puntos, DV en mayúscula) */
export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

/** Valida el dígito verificador de un RUT chileno */
export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 8 || limpio.length > 9) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado;
}

/** Quita espacios al inicio/fin; deja vacíos como null (para usar con @Transform) */
export function textoLimpio({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
}

/**
 * Instante (UTC) que corresponde a una fecha y hora de Chile continental.
 * Considera el horario de verano/invierno (UTC-3 / UTC-4).
 * Ej: instanteSantiago('2026-10-04') -> inicio del día 04-10 en Chile.
 */
export function instanteSantiago(fecha: string, hora = '00:00:00.000'): Date {
  const comoUtc = new Date(`${fecha}T${hora}Z`);
  const zona =
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', timeZoneName: 'longOffset' })
      .formatToParts(comoUtc)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-03:00';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(zona);
  const minutos = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -180;
  return new Date(comoUtc.getTime() - minutos * 60_000);
}
