import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CargaVentas,
  CargaVentasDetalle,
  CategoriaProducto,
  CierreManual,
  Conteo,
  ConteoResumen,
  Factura,
  FacturaResumen,
  FilaProductoArchivo,
  Kardex,
  LineaVentaArchivo,
  Mesonera,
  NuevaFactura,
  NuevoConteo,
  Producto,
  ProductoForm,
  Proveedor,
  ProveedorForm,
  ReporteVentas,
  ResultadoImportacionProductos,
  ResultadoImportacionVentas,
  Stock,
} from '../../core/models';

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

  // ---------- Facturas de mercadería ----------
  facturas(filtro: {
    desde?: string;
    hasta?: string;
    proveedorId?: number;
    numero?: string;
    incluirAnuladas?: boolean;
  }): Observable<FacturaResumen[]> {
    let params = new HttpParams();
    if (filtro.desde) params = params.set('desde', filtro.desde);
    if (filtro.hasta) params = params.set('hasta', filtro.hasta);
    if (filtro.proveedorId) params = params.set('proveedorId', filtro.proveedorId);
    if (filtro.numero) params = params.set('numero', filtro.numero);
    if (filtro.incluirAnuladas) params = params.set('incluirAnuladas', true);
    return this.http.get<FacturaResumen[]>('/api/facturas', { params });
  }

  factura(id: number): Observable<Factura> {
    return this.http.get<Factura>(`/api/facturas/${id}`);
  }

  crearFactura(datos: NuevaFactura): Observable<Factura> {
    return this.http.post<Factura>('/api/facturas', datos);
  }

  anularFactura(id: number, motivo: string): Observable<Factura> {
    return this.http.post<Factura>(`/api/facturas/${id}/anular`, { motivo });
  }

  adjuntarArchivo(id: number, archivo: File): Observable<Factura> {
    const datos = new FormData();
    datos.append('archivo', archivo, archivo.name);
    return this.http.post<Factura>(`/api/facturas/${id}/archivo`, datos);
  }

  /** Descarga el adjunto con el token de sesión (un enlace directo no lo enviaría) */
  archivoFactura(id: number): Observable<Blob> {
    return this.http.get(`/api/facturas/${id}/archivo`, { responseType: 'blob' });
  }

  // ---------- Inventario ----------
  stock(filtro: { categoria?: CategoriaProducto; texto?: string; soloAlertas?: boolean } = {}): Observable<Stock> {
    let params = new HttpParams();
    if (filtro.categoria) params = params.set('categoria', filtro.categoria);
    if (filtro.texto) params = params.set('texto', filtro.texto);
    if (filtro.soloAlertas) params = params.set('soloAlertas', true);
    return this.http.get<Stock>('/api/inventario/stock', { params });
  }

  kardex(productoId: number, desde?: string, hasta?: string): Observable<Kardex> {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<Kardex>(`/api/inventario/kardex/${productoId}`, { params });
  }

  conteos(): Observable<ConteoResumen[]> {
    return this.http.get<ConteoResumen[]>('/api/inventario/conteos');
  }

  conteo(id: number): Observable<Conteo> {
    return this.http.get<Conteo>(`/api/inventario/conteos/${id}`);
  }

  crearConteo(datos: NuevoConteo): Observable<Conteo> {
    return this.http.post<Conteo>('/api/inventario/conteos', datos);
  }

  // ---------- Balanzas: catálogo y ventas ----------
  importarProductos(datos: {
    filas: FilaProductoArchivo[];
    categoriaPorDefecto: CategoriaProducto;
    unidadPorDefecto: 'KG' | 'UNIDAD';
    simular: boolean;
    nombreArchivo: string;
  }): Observable<ResultadoImportacionProductos> {
    return this.http.post<ResultadoImportacionProductos>('/api/productos/importar', datos);
  }

  cargasVentas(): Observable<CargaVentas[]> {
    return this.http.get<CargaVentas[]>('/api/ventas');
  }

  cargaVentas(id: number): Observable<CargaVentasDetalle> {
    return this.http.get<CargaVentasDetalle>(`/api/ventas/${id}`);
  }

  importarVentas(datos: {
    nombreArchivo: string;
    fechaPorDefecto?: string;
    lineas: LineaVentaArchivo[];
    simular: boolean;
  }): Observable<ResultadoImportacionVentas> {
    return this.http.post<ResultadoImportacionVentas>('/api/ventas/importar', datos);
  }

  cierreManual(datos: CierreManual): Observable<{ importacionId: number; totalProductos: number; totalMesoneras: number; diferencia: number }> {
    return this.http.post<{ importacionId: number; totalProductos: number; totalMesoneras: number; diferencia: number }>(
      '/api/ventas/cierre-manual',
      datos,
    );
  }

  anularCargaVentas(id: number, motivo: string): Observable<CargaVentasDetalle> {
    return this.http.post<CargaVentasDetalle>(`/api/ventas/${id}/anular`, { motivo });
  }

  mesoneras(): Observable<Mesonera[]> {
    return this.http.get<Mesonera[]>('/api/ventas/mesoneras');
  }

  reporteVentas(desde: string, hasta: string): Observable<ReporteVentas> {
    return this.http.get<ReporteVentas>('/api/ventas/reporte', { params: { desde, hasta } });
  }
}
