import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RegistroAuditoria } from '../../core/models';

/** Inicio del administrador: acceso a ambos módulos + últimos eventos de auditoría */
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
        <p class="pp-texto-suave">Clientes, guías y cuadre por repartidor.</p>
      </a>
      <a routerLink="/meson" class="pp-card acceso">
        <h2>Mesón</h2>
        <p class="pp-texto-suave">Facturas, inventario y balanzas.</p>
      </a>
    </div>

    <section class="pp-card">
      <div class="cabecera">
        <h2>Actividad reciente (auditoría)</h2>
        <button type="button" class="pp-btn pp-btn--secundario" (click)="cargar()">Actualizar</button>
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
                <th>Recurso</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              @for (r of registros(); track r.id) {
                <tr>
                  <td>{{ r.creadoEn | date: 'dd-MM-yyyy HH:mm:ss' }}</td>
                  <td>{{ r.usuario?.username ?? '—' }}</td>
                  <td><span class="pp-chip">{{ r.accion }}</span></td>
                  <td>{{ r.recurso }}</td>
                  <td>{{ r.estadoHttp ?? '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="pp-texto-suave">Sin registros todavía.</td></tr>
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
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.http.get<RegistroAuditoria[]>('/api/auditoria', { params: { limite: 50 } }).subscribe({
      next: (data) => this.registros.set(data),
      error: () => this.error.set('No se pudo cargar la auditoría.'),
    });
  }
}
