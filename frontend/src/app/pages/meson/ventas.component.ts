import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { CargaVentas } from '../../core/models';
import { MesonService } from './meson.service';

/** [MESÓN] Ventas de las balanzas: cargas por archivo o cierre manual del día */
@Component({
  selector: 'app-ventas',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Ventas de las balanzas</h1>
        <p class="pp-texto-suave">
          Cada carga descuenta del stock lo vendido. Use el archivo que exporta el software de las balanzas o,
          mientras no haya computador conectado, digite el reporte impreso del día.
        </p>
      </div>
      <div class="botones">
        <a routerLink="/meson/ventas/reporte" class="pp-btn pp-btn--secundario">Reporte por mesonera</a>
        <a routerLink="/meson/ventas/cierre" class="pp-btn pp-btn--secundario">Cierre manual del día</a>
        <a routerLink="/meson/ventas/importar" class="pp-btn">Importar archivo</a>
      </div>
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
              <th>Período</th>
              <th>Origen</th>
              <th class="num">Líneas</th>
              <th class="num">Total vendido</th>
              <th>Cargado por</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (c of cargas(); track c.id) {
              <tr class="fila" [class.anulada]="c.estado === 'ANULADA'" tabindex="0" (click)="abrir(c.id)" (keydown.enter)="abrir(c.id)">
                <td><strong>{{ c.id }}</strong></td>
                <td class="nowrap">
                  {{ c.desde | date: 'dd-MM-yyyy' : 'UTC' }}{{ c.hasta !== c.desde ? ' al ' + (c.hasta | date: 'dd-MM-yyyy' : 'UTC') : '' }}
                </td>
                <td>{{ c.origen === 'ARCHIVO' ? 'Archivo · ' + (c.nombreArchivo ?? '') : 'Cierre manual' }}</td>
                <td class="num">{{ c.lineas }}</td>
                <td class="num">{{ c.totalMonto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td>{{ c.usuario ?? '—' }} <small class="sub">{{ c.creadoEn | date: 'dd-MM HH:mm' }}</small></td>
                <td>
                  @if (c.estado === 'ANULADA') {
                    <span class="pp-chip anulada-chip" [title]="c.motivoAnulacion ?? ''">Anulada</span>
                  } @else {
                    <span class="pp-chip">Vigente</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'Aún no se han cargado ventas.' }}</td></tr>
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
      max-width: 640px;
    }
    .botones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .botones a {
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
      color: var(--pp-texto-suave);
    }
    tr.fila {
      cursor: pointer;
    }
    tr.fila:hover td,
    tr.fila:focus td {
      background: var(--pp-celeste-claro);
    }
    tr.anulada td {
      color: var(--pp-texto-suave);
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class VentasComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly cargas = signal<CargaVentas[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.cargasVentas().subscribe({
      next: (c) => {
        this.cargas.set(c);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar las ventas.'));
        this.cargando.set(false);
      },
    });
  }

  abrir(id: number): void {
    void this.router.navigate(['/meson/ventas', id]);
  }
}
