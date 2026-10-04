import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { Guia, NOMBRE_MODALIDAD, NOMBRE_VUELTA } from '../../core/models';
import { LogoComponent } from '../../layout/logo.component';
import { DespachoService } from '../despacho/despacho.service';

/**
 * Vista de impresión de guías: una guía por hoja carta.
 * Uso: /imprimir/guias?ids=12,13,14
 * Al abrirse registra la impresión; si la guía ya se había impreso, sale marcada "COPIA".
 */
@Component({
  selector: 'app-imprimir-guias',
  imports: [LogoComponent, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <div class="barra-impresion no-imprimir">
      <span>{{ guias().length }} guía(s) · Una guía por hoja carta. Para PDF elija "Guardar como PDF".</span>
      <div>
        <button type="button" class="pp-btn" (click)="imprimir()">Imprimir</button>
        <button type="button" class="pp-btn pp-btn--secundario" (click)="cerrar()">Cerrar</button>
      </div>
    </div>

    @if (preguntar()) {
      <div class="confirmacion no-imprimir" role="alertdialog" aria-live="assertive">
        <strong>¿Las guías se imprimieron correctamente?</strong>
        <span class="pp-texto-suave">Solo si responde "Sí", una próxima impresión saldrá marcada como COPIA.</span>
        <div>
          <button type="button" class="pp-btn" (click)="confirmar()">Sí, se imprimieron</button>
          <button type="button" class="pp-btn pp-btn--secundario" (click)="noImpresas()">No se imprimieron</button>
        </div>
      </div>
    }
    @if (aviso()) {
      <p class="pp-aviso-ok no-imprimir aviso-impresion">{{ aviso() }}</p>
    }
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
            <app-logo [tamano]="'grande'" />
            <div class="folio">
              <p class="tipo">GUÍA DE ENTREGA</p>
              <p class="numero">N° {{ folio(g.id) }}</p>
              <p>Fecha: <strong>{{ g.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</strong></p>
              <p>Entrega: <strong>{{ nombreVuelta[g.vuelta] }}</strong></p>
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
    .confirmacion {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      max-width: 200mm;
      margin: 1rem auto 0;
      padding: 1rem;
      background: #fff8ec;
      border: 2px solid var(--pp-alerta);
      border-radius: 10px;
      text-align: center;
    }
    .confirmacion button + button {
      margin-left: 0.5rem;
    }
    .aviso-impresion {
      max-width: 200mm;
      margin: 1rem auto 0;
    }
    .hojas {
      padding: 1rem 0;
    }
    /* Una guía por hoja carta (215,9 × 279,4 mm, márgenes de 8 mm) */
    .guia {
      position: relative;
      box-sizing: border-box;
      width: 200mm;
      height: 263mm;
      margin: 0 auto 6mm;
      padding: 12mm 12mm 10mm;
      background: #fff;
      color: #111;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-size: 13pt;
    }
    .marca {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 110pt;
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(214, 69, 69, 0.18);
      pointer-events: none;
    }
    .cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1b99e5;
      padding-bottom: 6mm;
    }
    .folio {
      text-align: right;
      border: 2px solid #1b99e5;
      border-radius: 8px;
      padding: 3mm 6mm;
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
      font-size: 24pt;
      font-weight: 800;
    }
    .datos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm 10mm;
      margin: 10mm 0;
    }
    .datos div {
      display: flex;
      gap: 2mm;
    }
    .datos dt {
      font-weight: 700;
      min-width: 28mm;
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
      padding: 5mm 3mm;
    }
    .detalle th {
      background: #e8f5fd;
      font-size: 11pt;
    }
    .destacado {
      font-size: 22pt;
      font-weight: 800;
    }
    .aviso {
      font-size: 11pt;
      margin: 8mm 0 0;
    }
    .legal {
      font-size: 9pt;
      color: #555;
      margin: auto 0 0;
      padding-top: 4mm;
      border-top: 1px solid #ddd;
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
        break-after: page;
      }
      .guia:last-child {
        break-after: auto;
      }
    }
  `,
})
export class ImprimirGuiasComponent {
  private readonly api = inject(DespachoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly nombreVuelta = NOMBRE_VUELTA;
  protected readonly guias = signal<Guia[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Se muestra al cerrar el diálogo de impresión: el navegador no informa si se imprimió o se canceló */
  protected readonly preguntar = signal(false);

  constructor() {
    const ids = (this.route.snapshot.queryParamMap.get('ids') ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);

    if (ids.length === 0) {
      this.error.set('No se indicaron guías para imprimir.');
      return;
    }

    window.addEventListener('afterprint', () => this.preguntar.set(this.guias().length > 0));

    this.api.guiasParaImprimir(ids).subscribe({
      next: (data) => {
        this.guias.set(data);
        // Espera a que carguen las fuentes antes de abrir el diálogo de impresión
        void document.fonts.ready.then(() => setTimeout(() => this.imprimir(), 300));
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
    this.aviso.set(null);
    this.preguntar.set(false);
    window.print();
    // En la mayoría de los navegadores window.print() espera a que se cierre el diálogo
    this.preguntar.set(true);
  }

  confirmar(): void {
    const ids = this.guias()
      .filter((g) => g.estado === 'VIGENTE')
      .map((g) => g.id);
    this.preguntar.set(false);
    if (ids.length === 0) return;
    this.api.confirmarImpresion(ids).subscribe({
      next: () => {
        // Desde ahora, si se vuelven a imprimir en esta pestaña, salen como COPIA
        this.guias.set(this.guias().map((g) => ({ ...g, esCopia: true })));
        this.aviso.set('Impresión registrada. Ya puede cerrar esta pestaña.');
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudo registrar la impresión.')),
    });
  }

  noImpresas(): void {
    this.preguntar.set(false);
    this.aviso.set('No se registró la impresión. Puede intentarlo de nuevo con "Imprimir".');
  }

  cerrar(): void {
    window.close();
  }
}
