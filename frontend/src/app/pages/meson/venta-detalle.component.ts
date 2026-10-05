import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { CargaVentasDetalle, TipoLineaVenta } from '../../core/models';
import { MesonService } from './meson.service';

const NOMBRE_TIPO: Record<TipoLineaVenta, string> = {
  PRODUCTO: 'Producto',
  MISC: '"Misc." sin producto',
  SIN_PRODUCTO: 'No reconocido',
};

/** [MESÓN] Detalle de una carga de ventas y su anulación */
@Component({
  selector: 'app-venta-detalle',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/ventas" class="volver">← Ventas</a>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (aviso()) {
      <p class="pp-alerta-error" role="alert">{{ aviso() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (carga(); as c) {
      <header class="encabezado">
        <div>
          <h1>
            Carga de ventas N° {{ c.id }}
            @if (c.estado === 'ANULADA') {
              <span class="pp-chip anulada-chip">Anulada</span>
            }
          </h1>
          <p class="pp-texto-suave">
            {{ c.origen === 'ARCHIVO' ? 'Archivo ' + (c.nombreArchivo ?? '') : 'Cierre manual' }} ·
            {{ c.desde | date: 'dd-MM-yyyy' : 'UTC' }}{{ c.hasta !== c.desde ? ' al ' + (c.hasta | date: 'dd-MM-yyyy' : 'UTC') : '' }} ·
            cargada por {{ c.usuario ?? '—' }} el {{ c.creadoEn | date: 'dd-MM-yyyy HH:mm' }}
            {{ c.observacion ? ' · ' + c.observacion : '' }}
          </p>
        </div>
        @if (c.estado === 'VIGENTE') {
          <button type="button" class="pp-btn pp-btn--peligro" [disabled]="trabajando()" (click)="anular(c)">Anular carga</button>
        }
      </header>

      @if (c.estado === 'ANULADA') {
        <section class="pp-card anulada-info">
          Anulada el {{ c.anuladaEn | date: 'dd-MM-yyyy HH:mm' }} por {{ c.anuladaPor ?? '—' }}. Motivo: {{ c.motivoAnulacion }}.
          Lo que había descontado volvió al stock.
        </section>
      }

      <div class="tarjetas">
        <div class="pp-card tarjeta"><span>Total</span><strong>{{ c.totalMonto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
        <div class="pp-card tarjeta ok"><span>Productos</span><strong>{{ total('PRODUCTO') | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
        <div class="pp-card tarjeta misc"><span>"Misc."</span><strong>{{ total('MISC') | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
        <div class="pp-card tarjeta sin"><span>No reconocidos</span><strong>{{ total('SIN_PRODUCTO') | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
      </div>

      @if (c.resumenes.length) {
        <section class="pp-card">
          <h2>Por mesonera</h2>
          <div class="tabla-scroll">
            <table class="pp-tabla">
              <thead><tr><th>Fecha</th><th>Mesonera</th><th class="num">Vendido</th><th class="num">"Misc."</th><th class="num">% Misc.</th><th class="num">Tickets</th></tr></thead>
              <tbody>
                @for (r of c.resumenes; track $index) {
                  <tr>
                    <td>{{ r.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                    <td>V{{ r.codigoMesonera }}{{ r.mesonera ? ' · ' + r.mesonera : '' }}</td>
                    <td class="num">{{ r.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                    <td class="num">{{ r.montoMisc | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                    <td class="num">{{ r.monto ? ((r.montoMisc / r.monto) * 100 | number: '1.0-1') + ' %' : '—' }}</td>
                    <td class="num">{{ r.tickets ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="pp-card">
        <h2>Detalle ({{ c.lineas.length }} líneas)</h2>
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead><tr><th>Fecha</th><th>Mesonera</th><th>Tipo</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead>
            <tbody>
              @for (l of c.lineas; track l.id) {
                <tr [class.misc]="l.tipo === 'MISC'" [class.sin]="l.tipo === 'SIN_PRODUCTO'">
                  <td class="nowrap">{{ l.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                  <td>{{ l.codigoMesonera ? 'V' + l.codigoMesonera : '—' }}</td>
                  <td>{{ nombreTipo[l.tipo] }}</td>
                  <td>
                    @if (l.producto) {
                      <a [routerLink]="['/meson/kardex', l.producto.id]">{{ l.producto.plu }} · {{ l.producto.nombre }}</a>
                    } @else {
                      {{ l.plu ? l.plu + ' · ' : '' }}{{ l.descripcion }}
                    }
                  </td>
                  <td class="num">{{ l.cantidad | number: '1.0-3' }}</td>
                  <td class="num">{{ l.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (!error()) {
      <p class="pp-texto-suave">Cargando…</p>
    }
  `,
  styles: `
    .volver {
      display: inline-block;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.5rem;
    }
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .encabezado h1 {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .encabezado p {
      margin: 0;
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
    .anulada-info {
      margin-bottom: 1rem;
      border-left: 5px solid var(--pp-error);
      background: #fff5f5;
    }
    section.pp-card {
      margin-bottom: 1rem;
    }
    h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .tarjeta {
      display: flex;
      flex-direction: column;
      border-left: 5px solid var(--pp-celeste);
    }
    .tarjeta strong {
      font-size: 1.3rem;
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
      overflow: auto;
      max-height: 480px;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .nowrap {
      white-space: nowrap;
    }
    tr.misc td {
      background: #fff8ec;
    }
    tr.sin td {
      background: #fff5f5;
    }
  `,
})
export class VentaDetalleComponent {
  private readonly api = inject(MesonService);

  protected readonly nombreTipo = NOMBRE_TIPO;
  protected readonly carga = signal<CargaVentasDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly trabajando = signal(false);

  private readonly totales = computed(() => {
    const t: Record<TipoLineaVenta, number> = { PRODUCTO: 0, MISC: 0, SIN_PRODUCTO: 0 };
    for (const l of this.carga()?.lineas ?? []) t[l.tipo] += l.monto;
    return t;
  });

  constructor() {
    const estado = (history.state ?? {}) as { nueva?: boolean; diferencia?: number };
    if (estado.nueva) this.mensaje.set('Ventas guardadas. Lo vendido de cada producto ya se descontó del stock.');
    if (estado.diferencia) {
      this.aviso.set(
        `Ojo: el total por mesonera difiere en $${Math.abs(estado.diferencia).toLocaleString('es-CL')} del total de productos + "Misc.". Revise el reporte de la balanza.`,
      );
    }
    const id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('Carga no válida.');
      return;
    }
    this.api.cargaVentas(id).subscribe({
      next: (c) => this.carga.set(c),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el detalle.')),
    });
  }

  protected total(tipo: TipoLineaVenta): number {
    return Math.round(this.totales()[tipo]);
  }

  anular(c: CargaVentasDetalle): void {
    const motivo = prompt(
      `Anular la carga de ventas N° ${c.id}.\nLo que descontó del stock volverá a sumarse. Luego podrá cargar de nuevo esos días.\n\nMotivo:`,
    );
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      this.error.set('Debe indicar un motivo de al menos 5 caracteres.');
      return;
    }
    this.error.set(null);
    this.mensaje.set(null);
    this.aviso.set(null);
    this.trabajando.set(true);
    this.api.anularCargaVentas(c.id, motivo.trim()).subscribe({
      next: (actualizada) => {
        this.trabajando.set(false);
        this.carga.set(actualizada);
        this.mensaje.set('Carga anulada y stock repuesto.');
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
