export type Rol = 'ADMIN' | 'MESON' | 'DESPACHO';

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  rol: Rol;
}

export interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}

export type ModalidadCliente = 'REPARTO' | 'PAGO_DIA_SIGUIENTE' | 'PRESENCIAL';

export const NOMBRE_MODALIDAD: Record<ModalidadCliente, string> = {
  REPARTO: 'Reparto',
  PAGO_DIA_SIGUIENTE: 'Pago día siguiente',
  PRESENCIAL: 'Presencial',
};

/** Los campos Decimal de la base de datos llegan como texto (ej. "1700") */
export type Decimal = string;

export interface Cliente {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  modalidad: ModalidadCliente;
  repartidorId: number | null;
  orden: number;
  precioKgEspecial: Decimal | null;
  kgDescuentoDiario: Decimal;
  activo: boolean;
  repartidor: { id: number; nombre: string } | null;
}

export interface ClienteForm {
  nombre: string;
  modalidad: ModalidadCliente;
  repartidorId: number | null;
  direccion: string | null;
  telefono: string | null;
  orden?: number;
  precioKgEspecial: number | null;
  kgDescuentoDiario: number;
}

export interface Repartidor {
  id: number;
  nombre: string;
  rut: string | null;
  patente: string | null;
  activo: boolean;
  _count?: { clientes: number };
}

export interface RepartidorForm {
  nombre: string;
  rut: string | null;
  patente: string | null;
}

export interface PrecioKg {
  id: number;
  valor: Decimal;
  vigenteDesde: string;
  creadoEn: string;
}

export interface RegistroAuditoria {
  id: string;
  accion: string;
  recurso: string;
  estadoHttp: number | null;
  ip: string | null;
  creadoEn: string;
  usuario: { username: string; nombre: string } | null;
}

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  MESON: 'Mesón',
  DESPACHO: 'Despacho',
};
