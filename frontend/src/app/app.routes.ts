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
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      // Al entrar a "/" se redirige al inicio de cada rol
      { path: '', pathMatch: 'full', redirectTo: () => inject(AuthService).rutaInicio() },
      {
        path: 'despacho',
        canActivate: [rolGuard('DESPACHO')],
        title: 'Despacho · Patopan',
        loadComponent: () =>
          import('./pages/despacho/despacho-inicio.component').then((m) => m.DespachoInicioComponent),
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
