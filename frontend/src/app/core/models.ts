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

// ---------- Planilla diaria ----------

/** Vueltas del día, igual que las columnas del cuaderno */
export type Vuelta = 1 | 2 | 3;
export const VUELTAS: Vuelta[] = [1, 2, 3];
export const NOMBRE_VUELTA: Record<Vuelta, string> = { 1: 'Mañana', 2: 'Tarde 1', 3: 'Tarde 2' };

export interface LineaDespacho {
  id: number;
  clienteId: number;
  vuelta: Vuelta;
  kg: Decimal;
  kgDescuento: Decimal;
  precioKg: Decimal;
  monto: Decimal;
}

export interface VueltaPlanilla {
  vuelta: Vuelta;
  despacho: LineaDespacho | null;
  guia: { id: number; impresiones: number } | null;
}

export interface FilaPlanilla {
  cliente: Cliente;
  precioKgAplicable: Decimal | null;
  vueltas: VueltaPlanilla[];
}

export interface Planilla {
  fecha: string;
  jornada: { id: number | null; cerrada: boolean; cerradaEn: string | null };
  precioGeneral: Decimal | null;
  filas: FilaPlanilla[];
}

// ---------- Guías ----------

export type EstadoDocumento = 'VIGENTE' | 'ANULADA';

export interface Guia {
  id: number;
  fecha: string;
  vuelta: Vuelta;
  kg: Decimal;
  kgDescuento: Decimal;
  precioKg: Decimal;
  monto: Decimal;
  estado: EstadoDocumento;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  impresiones: number;
  creadoEn: string;
  cliente: { id: number; nombre: string; modalidad: ModalidadCliente; direccion: string | null };
  repartidor: { id: number; nombre: string; patente: string | null } | null;
  /** Solo en la respuesta de impresión: true si ya se había impreso antes */
  esCopia?: boolean;
}

// ---------- Cuadre ----------

export interface LineaCuadre {
  clienteId: number;
  cliente: string;
  vueltas: Vuelta[];
  kg: number;
  kgDescuento: number;
  precioKg: number;
  monto: number;
  guiaIds: number[];
  sinGuia: number;
}

export interface CuadreRepartidor {
  repartidor: { id: number; nombre: string; patente: string | null };
  cobrosDelDia: LineaCuadre[];
  cobrosPagoDiaAnterior: LineaCuadre[];
  entregasPagoManana: LineaCuadre[];
  totales: { kgEntregados: number; montoACobrar: number; montoPagoManana: number };
}

export interface Cuadre {
  fecha: string;
  cerrada: boolean;
  fechaAnterior: string | null;
  repartidores: CuadreRepartidor[];
  presenciales: { lineas: LineaCuadre[]; totales: { kg: number; monto: number } };
  totalesDia: { kg: number; monto: number; sinGuia: number };
}
