import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { ConteoResumen } from '../../core/models';
import { MesonService } from './meson.service';

/** [MESÓN] Conteos físicos de inventario registrados */
@Component({
  selector: 'app-conteos',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Conteos de inventario</h1>
        <p class="pp-texto-suave">
          Compare lo que hay físicamente con lo que dice el sistema. Cada diferencia exige motivo y queda como ajuste en el kardex.
        </p>
      </div>
      <a routerLink="/meson/conteos/nuevo" class="pp-btn">+ Nuevo conteo</a>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Usuario</th>
              <th class="num">Productos contados</th>
              <th class="num">Con diferencia</th>
              <th class="num" title="Diferencia valorizada a precio de venta">Valor diferencia</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            @for (c of conteos(); track c.id) {
              <tr class="fila" tabindex="0" (click)="abrir(c.id)" (keydown.enter)="abrir(c.id)">
                <td><strong>{{ c.id }}</strong></td>
                <td class="nowrap">{{ c.fecha | date: 'dd-MM-yyyy HH:mm' }}</td>
                <td>{{ c.usuario ?? '—' }}</td>
                <td class="num">{{ c.productos }}</td>
                <td class="num" [class.alerta]="c.conDiferencia > 0">{{ c.conDiferencia }}</td>
                <td class="num" [class.negativo]="c.valorDiferencia < 0" [class.positivo]="c.valorDiferencia > 0">
                  {{ c.valorDiferencia | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                </td>
                <td class="sub">{{ c.observacion ?? '' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'Aún no hay conteos registrados.' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .encabezado a {
      text-decoration: none;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .nowrap {
      white-space: nowrap;
    }
    .sub {
      font-size: 0.82rem;
      color: var(--pp-texto-suave);
    }
    .alerta {
      color: var(--pp-alerta);
      font-weight: 700;
    }
    .negativo {
      color: var(--pp-error);
      font-weight: 600;
    }
    .positivo {
      color: var(--pp-exito);
      font-weight: 600;
    }
    tr.fila {
      cursor: pointer;
    }
    tr.fila:hover td,
    tr.fila:focus td {
      background: var(--pp-celeste-claro);
    }
  `,
})
export class ConteosComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly conteos = signal<ConteoResumen[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.conteos().subscribe({
      next: (c) => {
        this.conteos.set(c);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los conteos.'));
        this.cargando.set(false);
      },
    });
  }

  abrir(id: number): void {
    void this.router.navigate(['/meson/conteos', id]);
  }
}
