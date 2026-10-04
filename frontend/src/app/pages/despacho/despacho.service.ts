import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Cliente, ClienteForm, PrecioKg, Repartidor, RepartidorForm } from '../../core/models';

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
}

/** Fecha de hoy en formato AAAA-MM-DD (hora local del equipo) */
export function hoyISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
