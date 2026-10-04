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
            path: 'cuadre',
            title: 'Cuadre · Patopan',
            loadComponent: () => import('./pages/despacho/cuadre.component').then((m) => m.CuadreComponent),
          },
          {
            path: 'saldos',
            title: 'Pagos y saldos · Patopan',
            loadComponent: () => import('./pages/despacho/saldos.component').then((m) => m.SaldosComponent),
          },
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
        title: 'Mesón · Patopan',
        loadComponent: () =>
          import('./pages/meson/meson-inicio.component').then((m) => m.MesonInicioComponent),
      },
      {
        path: 'admin',
        canActivate: [rolGuard('ADMIN')],
        title: 'Administración · Patopan',
        loadComponent: () =>
          import('./pages/admin/admin-inicio.component').then((m) => m.AdminInicioComponent),
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
