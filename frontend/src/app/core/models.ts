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
  /** Pago día siguiente: quién cobra lo del día anterior (null = el mismo que reparte) */
  cobradorId: number | null;
  cobrador: { id: number; nombre: string } | null;
}

export interface ClienteForm {
  nombre: string;
  modalidad: ModalidadCliente;
  repartidorId: number | null;
  cobradorId: number | null;
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
  /** Paga habitual por día trabajado */
  pagaDiaria: Decimal;
  activo: boolean;
  _count?: { clientes: number };
}

export interface RepartidorForm {
  nombre: string;
  rut: string | null;
  patente: string | null;
  pagaDiaria: number;
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

/** Usuario visto desde la gestión de usuarios (administrador) */
export interface UsuarioAdmin {
  id: number;
  username: string;
  nombre: string;
  rol: Rol;
  codigo: string | null;
  activo: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
}

export interface UsuarioForm {
  username?: string;
  nombre: string;
  rol: Rol;
  codigo: string | null;
  password?: string;
}

/** Reglas de contraseña (las mismas que valida la API) */
export const REGLA_CLAVE = /^(?=.*[A-Za-zÁÉÍÓÚáéíóúÑñ])(?=.*\d).{8,72}$/;

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
  jornada: { id: number | null; cerrada: boolean; cerradaEn: string | null; repartidorUnicoId: number | null };
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

// ---------- Entrega del día ----------

/** Lo despachado a un cliente en un día (suma de sus vueltas) */
export interface CargoEntrega {
  fecha: string;
  kg: number;
  monto: number;
}

export interface FilaEntrega {
  clienteId: number;
  cliente: string;
  modalidad: ModalidadCliente;
  /** Días que se cobran hoy (o que quedaron sin pagar, si noPago) */
  cargos: CargoEntrega[];
  kg: number;
  monto: number;
  noPago: { nota: string | null } | null;
}

export interface EntregaRepartidor {
  repartidor: { id: number; nombre: string; patente: string | null };
  cobrosDelDia: FilaEntrega[];
  cobrosDiaAnterior: FilaEntrega[];
  noPagaron: FilaEntrega[];
  pagaDespues: FilaEntrega[];
  totales: {
    kgRepartidos: number;
    kgDelDia: number;
    kgDiaAnterior: number;
    /** Lo cobrado a clientes */
    montoEntregar: number;
    montoNoPagado: number;
    /** Paga del repartidor ese día (se descuenta) */
    paga: number;
    /** false = paga habitual sugerida, aún no confirmada para el día */
    pagaGuardada: boolean;
    /** Cobrado − paga */
    netoEntregar: number;
  };
}

export interface PendienteCobro {
  clienteId: number;
  cliente: string;
  modalidad: ModalidadCliente;
  activo: boolean;
  kg: number;
  monto: number;
  desde: string;
  motivo: string;
}

export interface Entrega {
  fecha: string;
  cerrada: boolean;
  repartidorUnico: { id: number; nombre: string; patente: string | null } | null;
  repartidores: EntregaRepartidor[];
  presenciales: {
    cobros: FilaEntrega[];
    noPagaron: FilaEntrega[];
    totales: { kg: number; monto: number; montoNoPagado: number };
  };
  pendientes: PendienteCobro[];
  sinRepartidor: string[];
  totalesDia: { kg: number; monto: number; montoEntregar: number; pagas: number; netoEntregar: number; sinGuia: number };
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
  codigoBarras: string | null;
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
  codigoBarras?: string | null;
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

export interface FacturaResumen {
  id: number;
  proveedorId: number;
  numero: string;
  fecha: string;
  neto: Decimal;
  iva: Decimal;
  total: Decimal;
  observacion: string | null;
  archivoPath: string | null;
  archivoNombre: string | null;
  archivoTipo: string | null;
  estado: EstadoDocumento;
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  creadoEn: string;
  proveedor: { id: number; rut: string; razonSocial: string };
  _count: { detalles: number };
}

export interface FacturaDetalleLinea {
  id: number;
  /** null = producto aún no registrado (no sumó stock) */
  productoId: number | null;
  descripcion: string | null;
  cantidad: Decimal;
  costoUnitario: Decimal;
  subtotal: Decimal;
  producto: { id: number; plu: string; nombre: string; unidad: UnidadMedida } | null;
}

export interface Factura extends FacturaResumen {
  detalles: FacturaDetalleLinea[];
  creadoPor: string | null;
  anuladaPor: string | null;
}

export interface NuevaFactura {
  proveedorId: number;
  numero: string;
  fecha: string;
  /** Solo si no hay líneas: neto escrito a mano */
  neto?: number;
  iva?: number;
  observacion: string | null;
  lineas: { productoId: number | null; descripcion: string | null; cantidad: number; costoUnitario: number }[];
}

// ---------- Inventario ----------

export type EstadoStock = 'SIN_STOCK' | 'BAJO' | 'OK';

export interface FilaStock {
  id: number;
  plu: string;
  codigoBarras: string | null;
  nombre: string;
  categoria: CategoriaProducto;
  unidad: UnidadMedida;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  faltante: number;
  estado: EstadoStock;
  ultimoMovimiento: string | null;
}

export interface Stock {
  resumen: { productos: number; sinStock: number; bajo: number };
  filas: FilaStock[];
}

export type TipoMovimiento =
  | 'ENTRADA_FACTURA'
  | 'ANULACION_FACTURA'
  | 'SALIDA_VENTA'
  | 'ANULACION_VENTA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO';

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA_FACTURA: 'Entrada por factura',
  ANULACION_FACTURA: 'Anulación de factura',
  SALIDA_VENTA: 'Venta (balanza)',
  ANULACION_VENTA: 'Anulación de ventas',
  AJUSTE_POSITIVO: 'Ajuste + (conteo)',
  AJUSTE_NEGATIVO: 'Ajuste − (conteo)',
};

export interface MovimientoKardex {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  cantidad: number;
  saldo: number;
  origenTipo: string | null;
  origenId: number | null;
  motivo: string | null;
  codigoMesonera: string | null;
  usuario: string | null;
}

export interface Kardex {
  producto: { id: number; plu: string; nombre: string; unidad: UnidadMedida; stockActual: number };
  desde: string | null;
  hasta: string | null;
  saldoInicial: number;
  saldoFinal: number;
  entradas: number;
  salidas: number;
  movimientos: MovimientoKardex[];
}

export type MotivoAjuste = 'MERMA' | 'VENCIMIENTO' | 'PERDIDA' | 'ERROR_REGISTRO' | 'OTRO';

export const NOMBRE_MOTIVO_AJUSTE: Record<MotivoAjuste, string> = {
  MERMA: 'Merma',
  VENCIMIENTO: 'Vencimiento',
  PERDIDA: 'Pérdida',
  ERROR_REGISTRO: 'Error de registro',
  OTRO: 'Otro',
};

export interface ConteoResumen {
  id: number;
  fecha: string;
  observacion: string | null;
  usuario: string | null;
  productos: number;
  conDiferencia: number;
  valorDiferencia: number;
}

export interface Conteo {
  id: number;
  fecha: string;
  observacion: string | null;
  usuario: string | null;
  detalles: {
    id: number;
    producto: { id: number; plu: string; nombre: string; categoria: CategoriaProducto; unidad: UnidadMedida; precioVenta: number };
    stockEsperado: number;
    stockContado: number;
    diferencia: number;
    valorDiferencia: number;
    motivo: string | null;
  }[];
  resumen: {
    productos: number;
    conDiferencia: number;
    faltantes: number;
    sobrantes: number;
    valorFaltante: number;
    valorSobrante: number;
  };
}

export interface NuevoConteo {
  observacion: string | null;
  lineas: { productoId: number; stockContado: number; motivo?: MotivoAjuste; detalle?: string | null }[];
}

// ---------- Balanzas: catálogo y ventas ----------

export interface ResultadoImportacionProductos {
  filasLeidas: number;
  nuevos: { fila: number; plu: string; nombre: string; precio: number; unidad: UnidadMedida; categoria: CategoriaProducto }[];
  actualizados: { plu: string; nombre: string; cambios: string[] }[];
  sinCambios: number;
  errores: { fila: number; mensaje: string }[];
  omitidos: { fila: number; plu: string; motivo: string }[];
  advertencias: string[];
  guardado: boolean;
}

export interface ResultadoImportacionBarras {
  asignados: { plu: string; nombre: string; antes: string | null; despues: string }[];
  sinCambios: number;
  sinCodigo: number;
  noEncontrados: string[];
  compartidos: string[];
  errores: { fila: number; mensaje: string }[];
  guardado: boolean;
}

export interface FilaProductoArchivo {
  fila: number;
  plu: string | null;
  nombre: string | null;
  precioVenta: number | null;
  unidad: string | null;
  categoria: string | null;
}

export interface LineaVentaArchivo {
  fila: number;
  fecha: string | null;
  plu: string | null;
  descripcion: string | null;
  cantidad: number | null;
  monto: number | null;
  mesonera: string | null;
}

export type TipoLineaVenta = 'PRODUCTO' | 'MISC' | 'SIN_PRODUCTO';

export interface ResultadoImportacionVentas {
  periodo: { desde: string; hasta: string; dias: number };
  lineasAgrupadas: number;
  totales: { ventas: number; productos: number; misc: number; sinProducto: number };
  productosConStock: number;
  sinProducto: { plu: string | null; descripcion: string; cantidad: number; monto: number }[];
  mesoneras: { fecha: string; codigoMesonera: string; monto: number; montoMisc: number; lineasMisc: number }[];
  errores: { fila: number; mensaje: string }[];
  omitidas: number;
  advertencias: string[];
  guardado: boolean;
  importacionId: number | null;
}

export interface CargaVentas {
  id: number;
  origen: 'ARCHIVO' | 'MANUAL';
  nombreArchivo: string | null;
  desde: string;
  hasta: string;
  lineas: number;
  totalMonto: number;
  estado: EstadoDocumento;
  motivoAnulacion: string | null;
  usuario: string | null;
  creadoEn: string;
}

export interface CargaVentasDetalle extends Omit<CargaVentas, 'lineas'> {
  observacion: string | null;
  anuladaEn: string | null;
  anuladaPor: string | null;
  lineas: {
    id: number;
    fecha: string;
    codigoMesonera: string | null;
    tipo: TipoLineaVenta;
    producto: { id: number; plu: string; nombre: string; unidad: UnidadMedida } | null;
    plu: string | null;
    descripcion: string;
    cantidad: number;
    monto: number;
  }[];
  resumenes: {
    fecha: string;
    codigoMesonera: string;
    mesonera: string | null;
    monto: number;
    montoMisc: number;
    lineasMisc: number;
    tickets: number | null;
  }[];
}

export interface Mesonera {
  codigo: string;
  nombre: string;
  username: string;
  activo: boolean;
}

export interface CierreManual {
  fecha: string;
  lineas: { productoId: number; cantidad: number; monto: number }[];
  mesoneras: { codigo: string; monto: number; montoMisc: number; tickets: number | null }[];
  montoMisc?: number;
  observacion: string | null;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  totales: { ventas: number; productos: number; misc: number; sinProducto: number; porcentajeMisc: number };
  mesoneras: {
    codigo: string;
    mesonera: string | null;
    dias: number;
    monto: number;
    montoMisc: number;
    lineasMisc: number;
    tickets: number | null;
    porcentajeMisc: number;
  }[];
  masVendidos: { producto: { id: number; plu: string; nombre: string; unidad: UnidadMedida } | null; cantidad: number; monto: number }[];
}
