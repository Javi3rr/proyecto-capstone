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
  usuarioId: number | null;
  accion: string;
  recurso: string;
  estadoHttp: number | null;
  ip: string | null;
  /** Peticiones HTTP: { params, body }. Eventos: { antes, despues } */
  detalle: unknown;
  creadoEn: string;
  usuario: { username: string; nombre: string } | null;
}

export interface PaginaAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface FiltroAuditoria {
  usuarioId?: number;
  accion?: string;
  texto?: string;
  desde?: string;
  hasta?: string;
  soloEventos?: boolean;
  soloErrores?: boolean;
  pagina?: number;
  porPagina?: number;
}

export interface OpcionesAuditoria {
  acciones: string[];
  usuarios: { id: number; username: string; nombre: string; rol: Rol }[];
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
  /** Lo que pagó en el cuadre de este día (null = aún no se registra) */
  pagado: number | null;
  /** Lo que debía antes de este día (negativo = saldo a favor) */
  saldoAnterior: number;
}

export interface CuadreRepartidor {
  repartidor: { id: number; nombre: string; patente: string | null };
  cobrosDelDia: LineaCuadre[];
  cobrosPagoDiaAnterior: LineaCuadre[];
  entregasPagoManana: LineaCuadre[];
  totales: {
    kgEntregados: number;
    montoACobrar: number;
    montoPagoManana: number;
    montoRecibido: number;
    pagosSinRegistrar: number;
  };
}

export interface Cuadre {
  fecha: string;
  cerrada: boolean;
  fechaAnterior: string | null;
  repartidores: CuadreRepartidor[];
  presenciales: {
    lineas: LineaCuadre[];
    totales: { kg: number; monto: number; montoRecibido: number; pagosSinRegistrar: number };
  };
  totalesDia: { kg: number; monto: number; sinGuia: number };
}

// ---------- Pagos y saldos ----------

export interface SaldoCliente {
  clienteId: number;
  cliente: string;
  modalidad: ModalidadCliente;
  repartidor: { id: number; nombre: string } | null;
  activo: boolean;
  totalDespachado: number;
  totalPagado: number;
  /** Positivo = debe; negativo = saldo a favor */
  saldo: number;
  /** Pago día siguiente entregado y que aún no corresponde cobrar */
  porCobrar: number;
  ultimoPago: string | null;
}

export interface MovimientoCuenta {
  fecha: string;
  despachos: { fechaDespacho: string; kg: number; monto: number }[];
  cargo: number;
  pagado: number;
  recibidoPor: string | null;
  saldo: number;
}

export interface EstadoCuenta {
  cliente: { id: number; nombre: string; modalidad: ModalidadCliente; repartidor: { id: number; nombre: string } | null };
  desde: string;
  hasta: string;
  saldoInicial: number;
  movimientos: MovimientoCuenta[];
  saldoFinal: number;
  porCobrar: number;
  totales: { cargo: number; pagado: number };
}

// ---------- Reportes ----------

export interface FilaHistorial {
  id: number;
  fecha: string;
  vuelta: Vuelta;
  cliente: { id: number; nombre: string; modalidad: ModalidadCliente };
  repartidor: { id: number; nombre: string } | null;
  kg: number;
  kgDescuento: number;
  precioKg: number;
  monto: number;
  guias: { id: number; estado: EstadoDocumento; impresiones: number; motivoAnulacion: string | null }[];
  registradoPor: string | null;
  actualizadoEn: string;
}

export interface Historial {
  filas: FilaHistorial[];
  truncado: boolean;
  totales: { registros: number; dias: number; kg: number; monto: number; sinGuia: number };
}

export interface FiltroHistorial {
  desde: string;
  hasta: string;
  clienteId?: number;
  repartidorId?: number;
  vuelta?: Vuelta;
  modalidad?: ModalidadCliente;
}

export interface FilaPromedio {
  clienteId: number;
  cliente: string;
  modalidad: ModalidadCliente;
  repartidor: string | null;
  kgPorMes: number[];
  diasPorMes: number[];
  totalKg: number;
  totalDias: number;
  promedioMensual: number;
  promedioDiario: number;
  /** % de cambio del promedio diario del último mes respecto a los anteriores */
  variacion: number | null;
  anomalia: boolean;
}

export interface PromedioMensual {
  meses: string[];
  umbralVariacion: number;
  filas: FilaPromedio[];
  totalesPorMes: number[];
  totalKg: number;
}

// ---------- Mesón ----------

export type CategoriaProducto = 'PAN' | 'CECINAS' | 'MERCADERIA';
export type UnidadMedida = 'KG' | 'UNIDAD';

export const NOMBRE_CATEGORIA: Record<CategoriaProducto, string> = {
  PAN: 'Pan',
  CECINAS: 'Cecinas',
  MERCADERIA: 'Mercadería',
};

export const NOMBRE_UNIDAD: Record<UnidadMedida, string> = { KG: 'Kg', UNIDAD: 'Unidad' };

export interface Producto {
  id: number;
  plu: string;
  nombre: string;
  categoria: CategoriaProducto;
  unidad: UnidadMedida;
  precioVenta: Decimal;
  stockMinimo: Decimal;
  stockActual: Decimal;
  activo: boolean;
}

export interface ProductoForm {
  plu: string;
  nombre: string;
  categoria: CategoriaProducto;
  unidad: UnidadMedida;
  precioVenta: number;
  stockMinimo: number;
}

export interface Proveedor {
  id: number;
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  _count?: { facturas: number };
}

export interface ProveedorForm {
  rut: string;
  razonSocial: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
}
