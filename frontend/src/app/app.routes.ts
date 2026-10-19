import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard, invitadoGuard, rolGuard } from './core/auth.guards';
import { AuthService } from './core/auth.service';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitadoGuard],
    title: 'Ingresar · Patopan',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    // Vista de impresión (sin encabezado ni menú)
    path: 'imprimir/guias',
    canActivate: [authGuard, rolGuard('DESPACHO')],
    title: 'Imprimir guías · Patopan',
    loadComponent: () =>
      import('./pages/imprimir/imprimir-guias.component').then((m) => m.ImprimirGuiasComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      // Al entrar a "/" se redirige al inicio de cada rol
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).rutaInicio() },
      {
        path: 'despacho',
        canActivate: [rolGuard('DESPACHO')],
        loadComponent: () =>
          import('./pages/despacho/despacho-layout.component').then((m) => m.DespachoLayoutComponent),
        children: [
          {
            path: '',
            title: 'Despacho · Patopan',
            loadComponent: () =>
              import('./pages/despacho/despacho-inicio.component').then((m) => m.DespachoInicioComponent),
          },
          {
            path: 'planilla',
            title: 'Planilla del día · Patopan',
            loadComponent: () =>
              import('./pages/despacho/planilla.component').then((m) => m.PlanillaComponent),
          },
          {
            path: 'guias',
            title: 'Guías · Patopan',
            loadComponent: () => import('./pages/despacho/guias.component').then((m) => m.GuiasComponent),
          },
          {
            path: 'entrega',
            title: 'Entrega del día · Patopan',
            loadComponent: () => import('./pages/despacho/entrega.component').then((m) => m.EntregaComponent),
          },
          // Pantallas antiguas reemplazadas por la Entrega del día
          { path: 'cuadre', redirectTo: 'entrega' },
          { path: 'saldos', redirectTo: 'entrega' },
          {
            path: 'historial',
            title: 'Historial de despachos · Patopan',
            loadComponent: () =>
              import('./pages/despacho/historial.component').then((m) => m.HistorialComponent),
          },
          {
            path: 'promedios',
            title: 'Promedio mensual · Patopan',
            loadComponent: () =>
              import('./pages/despacho/promedios.component').then((m) => m.PromediosComponent),
          },
          {
            path: 'clientes',
            title: 'Clientes · Patopan',
            loadComponent: () =>
              import('./pages/despacho/clientes.component').then((m) => m.ClientesComponent),
          },
          {
            path: 'repartidores',
            title: 'Repartidores · Patopan',
            loadComponent: () =>
              import('./pages/despacho/repartidores.component').then((m) => m.RepartidoresComponent),
          },
          {
            path: 'precios',
            title: 'Precio del kg · Patopan',
            loadComponent: () =>
              import('./pages/despacho/precios.component').then((m) => m.PreciosComponent),
          },
        ],
      },
      {
        path: 'meson',
        canActivate: [rolGuard('MESON')],
        loadComponent: () => import('./pages/meson/meson-layout.component').then((m) => m.MesonLayoutComponent),
        children: [
          {
            path: '',
            title: 'Mesón · Patopan',
            loadComponent: () => import('./pages/meson/meson-inicio.component').then((m) => m.MesonInicioComponent),
          },
          {
            path: 'facturas',
            title: 'Facturas · Patopan',
            loadComponent: () => import('./pages/meson/facturas.component').then((m) => m.FacturasComponent),
          },
          {
            path: 'facturas/nueva',
            title: 'Nueva factura · Patopan',
            loadComponent: () => import('./pages/meson/factura-nueva.component').then((m) => m.FacturaNuevaComponent),
          },
          {
            path: 'facturas/:id',
            title: 'Factura · Patopan',
            loadComponent: () =>
              import('./pages/meson/factura-detalle.component').then((m) => m.FacturaDetalleComponent),
          },
          {
            path: 'stock',
            title: 'Stock · Patopan',
            loadComponent: () => import('./pages/meson/stock.component').then((m) => m.StockComponent),
          },
          {
            path: 'kardex/:id',
            title: 'Kardex · Patopan',
            loadComponent: () => import('./pages/meson/kardex.component').then((m) => m.KardexComponent),
          },
          {
            path: 'conteos',
            title: 'Conteos · Patopan',
            loadComponent: () => import('./pages/meson/conteos.component').then((m) => m.ConteosComponent),
          },
          {
            path: 'conteos/nuevo',
            title: 'Nuevo conteo · Patopan',
            loadComponent: () => import('./pages/meson/conteo-nuevo.component').then((m) => m.ConteoNuevoComponent),
          },
          {
            path: 'conteos/:id',
            title: 'Conteo · Patopan',
            loadComponent: () => import('./pages/meson/conteo-detalle.component').then((m) => m.ConteoDetalleComponent),
          },
          {
            path: 'ventas',
            title: 'Ventas · Patopan',
            loadComponent: () => import('./pages/meson/ventas.component').then((m) => m.VentasComponent),
          },
          {
            path: 'ventas/importar',
            title: 'Importar ventas · Patopan',
            loadComponent: () => import('./pages/meson/ventas-importar.component').then((m) => m.VentasImportarComponent),
          },
          {
            path: 'ventas/cierre',
            title: 'Cierre de ventas · Patopan',
            loadComponent: () => import('./pages/meson/cierre-ventas.component').then((m) => m.CierreVentasComponent),
          },
          {
            path: 'ventas/reporte',
            title: 'Ventas por mesonera · Patopan',
            loadComponent: () => import('./pages/meson/reporte-ventas.component').then((m) => m.ReporteVentasComponent),
          },
          {
            path: 'ventas/:id',
            title: 'Carga de ventas · Patopan',
            loadComponent: () => import('./pages/meson/venta-detalle.component').then((m) => m.VentaDetalleComponent),
          },
          {
            path: 'productos/importar-barras',
            title: 'Importar códigos de barras · Patopan',
            loadComponent: () =>
              import('./pages/meson/productos-barras.component').then((m) => m.ProductosBarrasComponent),
          },
          {
            path: 'productos/importar',
            title: 'Importar productos · Patopan',
            loadComponent: () =>
              import('./pages/meson/productos-importar.component').then((m) => m.ProductosImportarComponent),
          },
          {
            path: 'productos',
            title: 'Productos · Patopan',
            loadComponent: () => import('./pages/meson/productos.component').then((m) => m.ProductosComponent),
          },
          {
            path: 'proveedores',
            title: 'Proveedores · Patopan',
            loadComponent: () => import('./pages/meson/proveedores.component').then((m) => m.ProveedoresComponent),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [rolGuard('ADMIN')],
        children: [
          {
            path: '',
            title: 'Administración · Patopan',
            loadComponent: () => import('./pages/admin/admin-inicio.component').then((m) => m.AdminInicioComponent),
          },
          {
            path: 'usuarios',
            title: 'Usuarios · Patopan',
            loadComponent: () => import('./pages/admin/usuarios.component').then((m) => m.UsuariosComponent),
          },
          {
            path: 'auditoria',
            title: 'Auditoría · Patopan',
            loadComponent: () => import('./pages/admin/auditoria.component').then((m) => m.AuditoriaComponent),
          },
        ],
      },
      {
        path: 'cuenta',
        title: 'Mi contraseña · Patopan',
        loadComponent: () => import('./pages/cuenta.component').then((m) => m.CuentaComponent),
      },
      {
        path: 'no-autorizado',
        title: 'Sin acceso · Patopan',
        loadComponent: () =>
          import('./pages/no-autorizado.component').then((m) => m.NoAutorizadoComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
