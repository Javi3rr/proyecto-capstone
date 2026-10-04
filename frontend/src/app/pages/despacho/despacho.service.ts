import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Cliente,
  ClienteForm,
  Cuadre,
  EstadoCuenta,
  FiltroHistorial,
  Guia,
  Historial,
  LineaDespacho,
  ModalidadCliente,
  Planilla,
  PrecioKg,
  PromedioMensual,
  Repartidor,
  RepartidorForm,
  SaldoCliente,
  Vuelta,
} from '../../core/models';

/** Acceso a la API del módulo Despacho */
@Injectable({ providedIn: 'root' })
export class DespachoService {
  private readonly http = inject(HttpClient);

  // ---------- Clientes ----------
  clientes(incluirInactivos = false): Observable<Cliente[]> {
    const params = new HttpParams().set('incluirInactivos', incluirInactivos);
    return this.http.get<Cliente[]>('/api/clientes', { params });
  }

  crearCliente(datos: ClienteForm): Observable<Cliente> {
    return this.http.post<Cliente>('/api/clientes', datos);
  }

  actualizarCliente(id: number, datos: Partial<ClienteForm> & { activo?: boolean }): Observable<Cliente> {
    return this.http.patch<Cliente>(`/api/clientes/${id}`, datos);
  }

  desactivarCliente(id: number): Observable<Cliente> {
    return this.http.delete<Cliente>(`/api/clientes/${id}`);
  }

  // ---------- Repartidores ----------
  repartidores(incluirInactivos = false): Observable<Repartidor[]> {
    const params = new HttpParams().set('incluirInactivos', incluirInactivos);
    return this.http.get<Repartidor[]>('/api/repartidores', { params });
  }

  crearRepartidor(datos: RepartidorForm): Observable<Repartidor> {
    return this.http.post<Repartidor>('/api/repartidores', datos);
  }

  actualizarRepartidor(id: number, datos: Partial<RepartidorForm> & { activo?: boolean }): Observable<Repartidor> {
    return this.http.patch<Repartidor>(`/api/repartidores/${id}`, datos);
  }

  desactivarRepartidor(id: number): Observable<Repartidor> {
    return this.http.delete<Repartidor>(`/api/repartidores/${id}`);
  }

  // ---------- Precio del kg ----------
  precioVigente(): Observable<PrecioKg | null> {
    return this.http.get<PrecioKg | null>('/api/precios-kg/vigente');
  }

  historialPrecios(): Observable<PrecioKg[]> {
    return this.http.get<PrecioKg[]>('/api/precios-kg');
  }

  crearPrecio(valor: number, vigenteDesde: string): Observable<PrecioKg> {
    return this.http.post<PrecioKg>('/api/precios-kg', { valor, vigenteDesde });
  }

  // ---------- Planilla diaria ----------
  planilla(fecha: string): Observable<Planilla> {
    return this.http.get<Planilla>(`/api/planilla/${fecha}`);
  }

  /** Registra los kg de un cliente en una vuelta (kg = 0 elimina la línea) */
  registrarLinea(fecha: string, clienteId: number, vuelta: Vuelta, kg: number): Observable<LineaDespacho | { eliminado: true }> {
    return this.http.put<LineaDespacho | { eliminado: true }>(
      `/api/planilla/${fecha}/clientes/${clienteId}/vueltas/${vuelta}`,
      { kg },
    );
  }

  cerrarDia(fecha: string): Observable<unknown> {
    return this.http.post(`/api/planilla/${fecha}/cerrar`, {});
  }

  reabrirDia(fecha: string): Observable<unknown> {
    return this.http.post(`/api/planilla/${fecha}/reabrir`, {});
  }

  // ---------- Guías ----------
  emitirGuia(despachoId: number): Observable<Guia> {
    return this.http.post<Guia>('/api/guias', { despachoId });
  }

  emitirLote(
    fecha: string,
    filtro: { modalidad?: ModalidadCliente; repartidorId?: number; vuelta?: Vuelta },
  ): Observable<{ creadas: number[]; ids: number[] }> {
    return this.http.post<{ creadas: number[]; ids: number[] }>('/api/guias/lote', { fecha, ...filtro });
  }

  /** Guías para la vista de impresión (esCopia = ya se imprimió antes). No registra nada. */
  guiasParaImprimir(ids: number[]): Observable<Guia[]> {
    return this.http.get<Guia[]>('/api/guias/impresion', { params: { ids: ids.join(',') } });
  }

  /** Registra que las guías se imprimieron de verdad */
  confirmarImpresion(ids: number[]): Observable<{ registradas: number }> {
    return this.http.post<{ registradas: number }>('/api/guias/impresion/confirmar', { ids });
  }

  guias(filtro: { fecha?: string; numero?: number; clienteId?: number; incluirAnuladas?: boolean }): Observable<Guia[]> {
    let params = new HttpParams();
    if (filtro.fecha) params = params.set('fecha', filtro.fecha);
    if (filtro.numero) params = params.set('numero', filtro.numero);
    if (filtro.clienteId) params = params.set('clienteId', filtro.clienteId);
    if (filtro.incluirAnuladas) params = params.set('incluirAnuladas', true);
    return this.http.get<Guia[]>('/api/guias', { params });
  }

  anularGuia(id: number, motivo: string): Observable<Guia> {
    return this.http.post<Guia>(`/api/guias/${id}/anular`, { motivo });
  }

  // ---------- Cuadre ----------
  cuadre(fecha: string): Observable<Cuadre> {
    return this.http.get<Cuadre>(`/api/cuadre/${fecha}`);
  }

  // ---------- Pagos y saldos ----------
  /** Registra lo que pagó un cliente en el cuadre del día (monto 0 = no pagó) */
  registrarPago(fecha: string, clienteId: number, monto: number, repartidorId: number | null): Observable<unknown> {
    return this.http.put(`/api/pagos/${fecha}/clientes/${clienteId}`, { monto, repartidorId });
  }

  saldos(): Observable<SaldoCliente[]> {
    return this.http.get<SaldoCliente[]>('/api/pagos/saldos');
  }

  estadoCuenta(clienteId: number, desde: string, hasta: string): Observable<EstadoCuenta> {
    return this.http.get<EstadoCuenta>(`/api/pagos/clientes/${clienteId}/estado-cuenta`, { params: { desde, hasta } });
  }

  // ---------- Reportes ----------
  historial(filtro: FiltroHistorial): Observable<Historial> {
    let params = new HttpParams().set('desde', filtro.desde).set('hasta', filtro.hasta);
    if (filtro.clienteId) params = params.set('clienteId', filtro.clienteId);
    if (filtro.repartidorId) params = params.set('repartidorId', filtro.repartidorId);
    if (filtro.vuelta) params = params.set('vuelta', filtro.vuelta);
    if (filtro.modalidad) params = params.set('modalidad', filtro.modalidad);
    return this.http.get<Historial>('/api/reportes/historial', { params });
  }

  promedioMensual(filtro: {
    desde: string;
    hasta: string;
    repartidorId?: number;
    modalidad?: ModalidadCliente;
  }): Observable<PromedioMensual> {
    let params = new HttpParams().set('desde', filtro.desde).set('hasta', filtro.hasta);
    if (filtro.repartidorId) params = params.set('repartidorId', filtro.repartidorId);
    if (filtro.modalidad) params = params.set('modalidad', filtro.modalidad);
    return this.http.get<PromedioMensual>('/api/reportes/promedio-mensual', { params });
  }
}

/** Abre la vista de impresión de guías en una pestaña nueva */
export function abrirImpresionGuias(ids: number[]): void {
  if (ids.length === 0) return;
  window.open(`/imprimir/guias?ids=${ids.join(',')}`, '_blank');
}

/** Suma (o resta) días a una fecha AAAA-MM-DD */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Fecha de hoy en formato AAAA-MM-DD (hora local del equipo) */
export function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
