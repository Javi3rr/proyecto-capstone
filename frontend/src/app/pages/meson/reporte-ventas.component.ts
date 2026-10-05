import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { ReporteVentas } from '../../core/models';
import { hoyISO, sumarDias } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

/** % de "Misc." sobre lo vendido desde el cual se marca a la mesonera */
const UMBRAL_MISC = 10;

/** [MESÓN] Ventas por mesonera (código del voucher) y productos más vendidos */
@Component({
  selector: 'app-reporte-ventas',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/ventas" class="volver">← Ventas</a>
    <header class="encabezado">
      <h1>Ventas por mesonera</h1>
      <p class="pp-texto-suave">
        Las ventas "Misc. Por Conteo" se cobran sin elegir el producto: no descuentan stock ni dejan rastro de qué se vendió.
        Se marca en naranja a quien supera el {{ umbral }} % de sus ventas en "Misc.".
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); buscar(desde.value, hasta.value)">
        <label>Desde <input #desde type="date" [value]="filtroDesde()" /></label>
        <label>Hasta <input #hasta type="date" [value]="filtroHasta()" /></label>
        <button type="submit" class="pp-btn pp-btn--chico">Ver</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="!reporte()" (click)="exportar()">Exportar Excel (CSV)</button>
      </form>

      @if (reporte(); as r) {
        <div class="tarjetas">
          <div class="pp-card tarjeta"><span>Total vendido</span><strong>{{ r.totales.ventas | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
          <div class="pp-card tarjeta ok"><span>Con producto</span><strong>{{ r.totales.productos | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
          <div class="pp-card tarjeta misc">
            <span>"Misc."</span><strong>{{ r.totales.misc | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
            <small>{{ r.totales.porcentajeMisc | number: '1.0-1' }} % del total</small>
          </div>
          <div class="pp-card tarjeta sin"><span>No reconocidos</span><strong>{{ r.totales.sinProducto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
        </div>

        <h2>Por mesonera</h2>
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Mesonera</th>
                <th class="num">Días</th>
                <th class="num">Vendido</th>
                <th class="num">"Misc."</th>
                <th class="col-barra">% "Misc."</th>
                <th class="num">Tickets</th>
              </tr>
            </thead>
            <tbody>
              @for (m of r.mesoneras; track m.codigo) {
                <tr [class.alerta]="m.porcentajeMisc >= umbral">
                  <td><strong>V{{ m.codigo }}</strong>{{ m.mesonera ? ' · ' + m.mesonera : ' · (sin usuario asignado)' }}</td>
                  <td class="num">{{ m.dias }}</td>
                  <td class="num">{{ m.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ m.montoMisc | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="col-barra">
                    <div class="barra"><span [style.width.%]="ancho(m.porcentajeMisc)"></span><b>{{ m.porcentajeMisc | number: '1.0-1' }} %</b></div>
                  </td>
                  <td class="num">{{ m.tickets ?? '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="pp-texto-suave">Sin ventas por mesonera en el período (¿las cargas indican la mesonera?).</td></tr>
              }
            </tbody>
          </table>
        </div>

        <h2>Productos más vendidos</h2>
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead>
            <tbody>
              @for (p of r.masVendidos; track $index) {
                <tr>
                  <td>
                    @if (p.producto) {
                      <a [routerLink]="['/meson/kardex', p.producto.id]">{{ p.producto.plu }} · {{ p.producto.nombre }}</a>
                    }
                  </td>
                  <td class="num">{{ p.cantidad | number: '1.0-3' }} {{ p.producto?.unidad === 'KG' ? 'kg' : 'un.' }}</td>
                  <td class="num">{{ p.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="pp-texto-suave">Sin ventas de productos en el período.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (cargando()) {
        <p class="pp-texto-suave">Calculando…</p>
      }
    </section>
  `,
  styles: `
    .volver {
      display: inline-block;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.5rem;
    }
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
      margin-top: 1rem;
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 0.9rem;
      align-items: flex-end;
      margin-bottom: 0.75rem;
    }
    .filtros label {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--pp-texto-suave);
    }
    .filtros input {
      min-height: 36px;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
    }
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
    }
    .tarjeta {
      display: flex;
      flex-direction: column;
      border-left: 5px solid var(--pp-celeste);
    }
    .tarjeta strong {
      font-size: 1.3rem;
    }
    .tarjeta small {
      color: var(--pp-texto-suave);
    }
    .tarjeta.ok {
      border-left-color: var(--pp-exito);
    }
    .tarjeta.misc {
      border-left-color: var(--pp-alerta);
    }
    .tarjeta.sin {
      border-left-color: var(--pp-error);
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .col-barra {
      min-width: 160px;
    }
    .barra {
      position: relative;
      height: 1.3rem;
      background: var(--pp-celeste-claro);
      border-radius: 4px;
      overflow: hidden;
    }
    .barra span {
      position: absolute;
      inset: 0 auto 0 0;
      background: #f6c27c;
    }
    .barra b {
      position: relative;
      padding-left: 0.4rem;
      font-size: 0.8rem;
      line-height: 1.3rem;
    }
    tr.alerta td {
      background: #fff8ec;
    }
  `,
})
export class ReporteVentasComponent {
  private readonly api = inject(MesonService);

  protected readonly umbral = UMBRAL_MISC;
  protected readonly filtroDesde = signal(sumarDias(hoyISO(), -30));
  protected readonly filtroHasta = signal(hoyISO());
  protected readonly reporte = signal<ReporteVentas | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly maxPct = computed(() => Math.max(20, ...(this.reporte()?.mesoneras ?? []).map((m) => m.porcentajeMisc)));

  constructor() {
    this.cargar();
  }

  protected ancho(pct: number): number {
    return Math.round((pct / this.maxPct()) * 100);
  }

  buscar(desde: string, hasta: string): void {
    if (!desde || !hasta) {
      this.error.set('Indique las fechas.');
      return;
    }
    this.filtroDesde.set(desde);
    this.filtroHasta.set(hasta);
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.reporte.set(null);
    this.api.reporteVentas(this.filtroDesde(), this.filtroHasta()).subscribe({
      next: (r) => {
        this.reporte.set(r);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo calcular el reporte.'));
        this.cargando.set(false);
      },
    });
  }

  exportar(): void {
    const r = this.reporte();
    if (!r) return;
    descargarCsv(`ventas-mesoneras-${r.desde}-a-${r.hasta}.csv`, [
      ['Código', 'Mesonera', 'Días', 'Vendido', 'Misc.', '% Misc.', 'Tickets'],
      ...r.mesoneras.map((m) => [`V${m.codigo}`, m.mesonera ?? '', m.dias, m.monto, m.montoMisc, m.porcentajeMisc, m.tickets ?? '']),
    ]);
  }
}
