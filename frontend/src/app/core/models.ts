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

export interface Cliente {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  modalidad: ModalidadCliente;
  orden: number;
  repartidor: { id: number; nombre: string } | null;
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
