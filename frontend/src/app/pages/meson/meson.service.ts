import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CategoriaProducto, Producto, ProductoForm, Proveedor, ProveedorForm } from '../../core/models';

/** Acceso a la API del módulo Mesón */
@Injectable({ providedIn: 'root' })
export class MesonService {
  private readonly http = inject(HttpClient);

  // ---------- Productos ----------
  productos(filtro: { incluirInactivos?: boolean; categoria?: CategoriaProducto; texto?: string } = {}): Observable<Producto[]> {
    let params = new HttpParams();
    if (filtro.incluirInactivos) params = params.set('incluirInactivos', true);
    if (filtro.categoria) params = params.set('categoria', filtro.categoria);
    if (filtro.texto) params = params.set('texto', filtro.texto);
    return this.http.get<Producto[]>('/api/productos', { params });
  }

  crearProducto(datos: ProductoForm): Observable<Producto> {
    return this.http.post<Producto>('/api/productos', datos);
  }

  actualizarProducto(id: number, datos: Partial<ProductoForm> & { activo?: boolean }): Observable<Producto> {
    return this.http.patch<Producto>(`/api/productos/${id}`, datos);
  }

  desactivarProducto(id: number): Observable<Producto> {
    return this.http.delete<Producto>(`/api/productos/${id}`);
  }

  // ---------- Proveedores ----------
  proveedores(incluirInactivos = false): Observable<Proveedor[]> {
    const params = new HttpParams().set('incluirInactivos', incluirInactivos);
    return this.http.get<Proveedor[]>('/api/proveedores', { params });
  }

  crearProveedor(datos: ProveedorForm): Observable<Proveedor> {
    return this.http.post<Proveedor>('/api/proveedores', datos);
  }

  actualizarProveedor(id: number, datos: Partial<ProveedorForm> & { activo?: boolean }): Observable<Proveedor> {
    return this.http.patch<Proveedor>(`/api/proveedores/${id}`, datos);
  }

  desactivarProveedor(id: number): Observable<Proveedor> {
    return this.http.delete<Proveedor>(`/api/proveedores/${id}`);
  }
}
