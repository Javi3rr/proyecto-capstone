import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { Guia, NOMBRE_MODALIDAD } from '../../core/models';
import { LogoComponent } from '../../layout/logo.component';
import { DespachoService } from '../despacho/despacho.service';

/**
 * Vista de impresión de guías en hoja carta: 2 guías por hoja (se corta por la línea punteada).
 * Uso: /imprimir/guias?ids=12,13,14
 * Al abrirse registra la impresión; si la guía ya se había impreso, sale marcada "COPIA".
 */
@Component({
  selector: 'app-imprimir-guias',
  imports: [LogoComponent, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <div class="barra-impresion no-imprimir">
      <span>{{ guias().length }} guía(s) · Hoja carta, 2 por hoja. Para PDF elija "Guardar como PDF".</span>
      <div>
        <button type="button" class="pp-btn" (click)="imprimir()">Imprimir</button>
        <button type="button" class="pp-btn pp-btn--secundario" (click)="cerrar()">Cerrar</button>
      </div>
    </div>

    @if (error()) {
      <p class="pp-alerta-error no-imprimir">{{ error() }}</p>
    }

    <div class="hojas">
      @for (g of guias(); track g.id) {
        <article class="guia" [class.anulada]="g.estado === 'ANULADA'">
          @if (g.estado === 'ANULADA') {
            <div class="marca">ANULADA</div>
          } @else if (g.esCopia) {
            <div class="marca">COPIA</div>
          }

          <header class="cabecera">
            <app-logo />
            <div class="folio">
              <p class="tipo">GUÍA DE ENTREGA</p>
              <p class="numero">N° {{ folio(g.id) }}</p>
              <p>Fecha: <strong>{{ g.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</strong></p>
            </div>
          </header>

          <dl class="datos">
            <div><dt>Cliente</dt><dd>{{ g.cliente.nombre }}</dd></div>
            <div><dt>Modalidad</dt><dd>{{ nombreModalidad[g.cliente.modalidad] }}</dd></div>
            <div>
              <dt>Repartidor</dt>
              <dd>{{ g.repartidor ? g.repartidor.nombre + (g.repartidor.patente ? ' · ' + g.repartidor.patente : '') : 'Retiro en panadería' }}</dd>
            </div>
            <div><dt>Dirección</dt><dd>{{ g.cliente.direccion ?? '—' }}</dd></div>
          </dl>

          <table class="detalle">
            <thead>
              <tr>
                <th>Kg despachados</th>
                <th>Kg descuento</th>
                <th>Kg cobrados</th>
                <th>Precio por kg</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="destacado">{{ num(g.kg) | number: '1.0-3' }} kg</td>
                <td>{{ num(g.kgDescuento) > 0 ? (num(g.kgDescuento) | number: '1.0-3') + ' kg' : '—' }}</td>
                <td>{{ cobrados(g) | number: '1.0-3' }} kg</td>
                <td>{{ num(g.precioKg) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="destacado">{{ num(g.monto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
              </tr>
            </tbody>
          </table>

          <p class="aviso">Cliente: verifique el peso del pan al recibirlo. Ante cualquier diferencia, comuníquese con la panadería.</p>

          <footer class="firmas">
            <div><span class="linea"></span>Entregado por (repartidor)</div>
            <div><span class="linea"></span>Recibido conforme (nombre y firma)</div>
          </footer>
          <p class="legal">
            Documento interno de control de despacho, no válido como documento tributario ·
            Emitida {{ g.creadoEn | date: 'dd-MM-yyyy HH:mm' }}
            @if (g.estado === 'ANULADA') {
              · Anulada: {{ g.motivoAnulacion }}
            }
          </p>
        </article>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      background: #e9eef2;
      min-height: 100vh;
    }
    .barra-impresion {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
      background: var(--pp-blanco);
      border-bottom: 3px solid var(--pp-celeste);
      z-index: 5;
    }
    .barra-impresion button + button {
      margin-left: 0.5rem;
    }
    .hojas {
      padding: 1rem 0;
    }
    /* Media hoja carta (215,9 × 279,4 mm) */
    .guia {
      position: relative;
      box-sizing: border-box;
      width: 200mm;
      height: 128mm;
      margin: 0 auto 6mm;
      padding: 7mm 9mm;
      background: #fff;
      color: #111;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-size: 10.5pt;
    }
    .marca {
      position: absolute;
      top: 42%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-18deg);
      font-size: 64pt;
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(214, 69, 69, 0.18);
      pointer-events: none;
    }
    .cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1b99e5;
      padding-bottom: 3mm;
    }
    .folio {
      text-align: right;
      border: 2px solid #1b99e5;
      border-radius: 6px;
      padding: 2mm 4mm;
    }
    .folio p {
      margin: 0;
    }
    .tipo {
      font-weight: 800;
      color: #0f6fae;
      letter-spacing: 0.05em;
    }
    .numero {
      font-size: 16pt;
      font-weight: 800;
    }
    .datos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5mm 8mm;
      margin: 4mm 0;
    }
    .datos div {
      display: flex;
      gap: 2mm;
    }
    .datos dt {
      font-weight: 700;
      min-width: 22mm;
    }
    .datos dd {
      margin: 0;
    }
    .detalle {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
    }
    .detalle th,
    .detalle td {
      border: 1px solid #9fb6c6;
      padding: 2mm;
    }
    .detalle th {
      background: #e8f5fd;
      font-size: 9pt;
    }
    .destacado {
      font-size: 14pt;
      font-weight: 800;
    }
    .aviso {
      font-size: 9pt;
      margin: 3mm 0 0;
    }
    .firmas {
      display: flex;
      gap: 15mm;
      margin-top: auto;
      font-size: 9pt;
      text-align: center;
    }
    .firmas div {
      flex: 1;
    }
    .linea {
      display: block;
      border-top: 1px solid #333;
      margin-bottom: 1mm;
      padding-top: 10mm;
    }
    .legal {
      font-size: 7.5pt;
      color: #555;
      margin: 2mm 0 0;
      text-align: center;
    }
    @media print {
      :host {
        background: #fff;
      }
      .hojas {
        padding: 0;
      }
      .guia {
        margin: 0 auto;
        height: 131mm;
      }
      /* Línea de corte entre las dos guías de la hoja */
      .guia:nth-child(odd) {
        border-bottom: 1px dashed #999;
      }
      .guia:nth-child(even) {
        break-after: page;
      }
    }
  `,
})
export class ImprimirGuiasComponent {
  private readonly api = inject(DespachoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly guias = signal<Guia[]>([]);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const ids = (this.route.snapshot.queryParamMap.get('ids') ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);

    if (ids.length === 0) {
      this.error.set('No se indicaron guías para imprimir.');
      return;
    }

    this.api.imprimirGuias(ids).subscribe({
      next: (data) => {
        this.guias.set(data);
        // Espera a que carguen las fuentes antes de abrir el diálogo de impresión
        void document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudieron cargar las guías.')),
    });
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  protected cobrados(g: Guia): number {
    return Math.max(this.num(g.kg) - this.num(g.kgDescuento), 0);
  }

  protected folio(id: number): string {
    return String(id).padStart(6, '0');
  }

  imprimir(): void {
    window.print();
  }

  cerrar(): void {
    window.close();
  }
}
