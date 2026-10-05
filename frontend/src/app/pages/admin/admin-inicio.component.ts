import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PaginaAuditoria, RegistroAuditoria } from '../../core/models';

/** Inicio del administrador: acceso a todos los módulos + últimos eventos de auditoría */
@Component({
  selector: 'app-admin-inicio',
  imports: [RouterLink, DatePipe],
  template: `
    <header class="encabezado">
      <h1>Administración</h1>
      <p class="pp-texto-suave">Acceso a todos los módulos y registro de actividad del sistema.</p>
    </header>

    <div class="accesos">
      <a routerLink="/despacho" class="pp-card acceso">
        <h2>Despacho</h2>
        <p class="pp-texto-suave">Planilla, guías, cuadre, saldos y reportes.</p>
      </a>
      <a routerLink="/meson" class="pp-card acceso">
        <h2>Mesón</h2>
        <p class="pp-texto-suave">Productos, proveedores, facturas e inventario.</p>
      </a>
      <a routerLink="/admin/usuarios" class="pp-card acceso">
        <h2>Usuarios</h2>
        <p class="pp-texto-suave">Cuentas del personal, roles, contraseñas y códigos de mesonera.</p>
      </a>
      <a routerLink="/admin/auditoria" class="pp-card acceso">
        <h2>Auditoría</h2>
        <p class="pp-texto-suave">Quién hizo qué y cuándo, con filtros y detalle de cada cambio.</p>
      </a>
    </div>

    <section class="pp-card">
      <div class="cabecera">
        <h2>Últimos cambios</h2>
        <a routerLink="/admin/auditoria" class="pp-btn pp-btn--secundario pp-btn--chico">Ver toda la auditoría</a>
      </div>

      @if (error()) {
        <p class="pp-alerta-error" role="alert">{{ error() }}</p>
      } @else {
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Registro</th>
              </tr>
            </thead>
            <tbody>
              @for (r of registros(); track r.id) {
                <tr>
                  <td>{{ r.creadoEn | date: 'dd-MM-yyyy HH:mm' }}</td>
                  <td>{{ r.usuario?.username ?? '—' }}</td>
                  <td><span class="pp-chip">{{ r.accion }}</span></td>
                  <td>{{ r.recurso }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="pp-texto-suave">Sin registros todavía.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1.25rem;
    }
    .encabezado p {
      margin: 0;
    }
    .accesos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .acceso {
      text-decoration: none;
      color: inherit;
      border-left: 5px solid var(--pp-celeste);
    }
    .acceso:hover {
      background: var(--pp-celeste-claro);
    }
    .acceso h2 {
      color: var(--pp-celeste-oscuro);
      font-size: 1.1rem;
    }
    .acceso p {
      margin: 0;
    }
    .cabecera {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }
    .cabecera h2 {
      font-size: 1.05rem;
      margin: 0;
    }
    .cabecera a {
      text-decoration: none;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
  `,
})
export class AdminInicioComponent {
  private readonly http = inject(HttpClient);

  protected readonly registros = signal<RegistroAuditoria[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.http
      .get<PaginaAuditoria>('/api/auditoria', { params: { soloEventos: true, porPagina: 10 } })
      .subscribe({
        next: (p) => this.registros.set(p.registros),
        error: () => this.error.set('No se pudo cargar la auditoría.'),
      });
  }
}
