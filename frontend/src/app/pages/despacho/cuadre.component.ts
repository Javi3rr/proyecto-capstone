import { CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { mensajeError } from '../../core/errores';
import { Cuadre, CuadreRepartidor, LineaCuadre } from '../../core/models';
import { DespachoService, hoyISO, sumarDias } from './despacho.service';

/** [DESPACHO] Cuadre automático por repartidor y registro de lo que pagó cada cliente */
@Component({
  selector: 'app-cuadre',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet],
  template: `
    <header class="encabezado">
      <div>
        <h1>Cuadre del día</h1>
        <p class="pp-texto-suave">
          Anote en "Pagó" lo que entregó cada cliente (Enter pasa al siguiente). Lo que falte queda como saldo pendiente.
        </p>
      </div>
      <div class="fecha no-imprimir">
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(-1)">◀</button>
        <input type="date" [value]="fecha()" (change)="irA($any($event.target).value)" aria-label="Fecha del cuadre" />
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(1)">▶</button>
        <button type="button" class="pp-btn pp-btn--chico" (click)="imprimir()">Imprimir cuadre</button>
      </div>
      <p class="solo-imprimir">Fecha: <strong>{{ fecha() | date: 'dd-MM-yyyy' : 'UTC' }}</strong></p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (cuadre(); as c) {
      @if (c.totalesDia.sinGuia > 0) {
        <p class="pp-alerta-error no-imprimir">{{ c.totalesDia.sinGuia }} entrega(s) del día aún no tienen guía emitida.</p>
      }

      <div class="bloques">
        @for (r of c.repartidores; track r.repartidor.id) {
          <section class="pp-card bloque">
            <div class="bloque__cabecera">
              <h2>{{ r.repartidor.nombre }} {{ r.repartidor.patente ? '· ' + r.repartidor.patente : '' }}</h2>
              <div class="totales">
                <span>Kg hoy: <strong>{{ r.totales.kgEntregados | number: '1.0-3' }}</strong></span>
                <span class="rendir">Debe rendir: <strong>{{ r.totales.montoACobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
              </div>
            </div>

            <table class="pp-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="num">Kg</th>
                  <th class="num">Monto</th>
                  <th class="num" title="Lo que debía de días anteriores">Saldo ant.</th>
                  <th class="num">Pagó</th>
                  <th class="num">Queda</th>
                </tr>
              </thead>
              <tbody>
                @for (l of r.cobrosDelDia; track l.clienteId) {
                  <ng-container *ngTemplateOutlet="fila; context: { $implicit: l, repartidorId: r.repartidor.id, anterior: false }" />
                }
                @for (l of r.cobrosPagoDiaAnterior; track l.clienteId) {
                  <ng-container *ngTemplateOutlet="fila; context: { $implicit: l, repartidorId: r.repartidor.id, anterior: true }" />
                }
                @if (r.cobrosDelDia.length + r.cobrosPagoDiaAnterior.length === 0) {
                  <tr><td colspan="6" class="pp-texto-suave">Sin cobros hoy.</td></tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2"><strong>Totales</strong></td>
                  <td class="num"><strong>{{ r.totales.montoACobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td></td>
                  <td class="num"><strong>{{ r.totales.montoRecibido | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td class="num" [class.debe]="r.totales.montoACobrar - r.totales.montoRecibido > 0">
                    <strong>{{ r.totales.montoACobrar - r.totales.montoRecibido | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>

            <div class="pie no-imprimir">
              @if (r.totales.pagosSinRegistrar > 0) {
                <span class="pendientes">{{ r.totales.pagosSinRegistrar }} pago(s) sin registrar</span>
                <button
                  type="button"
                  class="pp-btn pp-btn--secundario pp-btn--chico"
                  [disabled]="guardando()"
                  (click)="pagaronExacto(cobrosDe(r), r.repartidor.id)"
                >
                  Los que faltan pagaron exacto
                </button>
              } @else if (r.cobrosDelDia.length + r.cobrosPagoDiaAnterior.length > 0) {
                <span class="listo">✓ Todos los pagos registrados</span>
              }
            </div>

            @if (r.entregasPagoManana.length > 0) {
              <p class="manana">
                Además entrega hoy a {{ r.entregasPagoManana.length }} cliente(s) de pago día siguiente
                ({{ r.totales.montoPagoManana | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}), que se cobran el próximo día trabajado:
                {{ nombres(r.entregasPagoManana) }}.
              </p>
            }

            <div class="firmas solo-imprimir">
              <div><span class="linea"></span>Rinde (repartidor)</div>
              <div><span class="linea"></span>Recibe (despachador)</div>
            </div>
          </section>
        } @empty {
          <section class="pp-card"><p class="pp-texto-suave">No hay despachos de reparto para esta fecha.</p></section>
        }

        @if (c.presenciales.lineas.length > 0) {
          <section class="pp-card bloque">
            <div class="bloque__cabecera">
              <h2>Presenciales (despachador)</h2>
              <div class="totales">
                <span>Kg: <strong>{{ c.presenciales.totales.kg | number: '1.0-3' }}</strong></span>
                <span class="rendir">Total: <strong>{{ c.presenciales.totales.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
              </div>
            </div>
            <table class="pp-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="num">Kg</th>
                  <th class="num">Monto</th>
                  <th class="num">Saldo ant.</th>
                  <th class="num">Pagó</th>
                  <th class="num">Queda</th>
                </tr>
              </thead>
              <tbody>
                @for (l of c.presenciales.lineas; track l.clienteId) {
                  <ng-container *ngTemplateOutlet="fila; context: { $implicit: l, repartidorId: null, anterior: false }" />
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2"><strong>Totales</strong></td>
                  <td class="num"><strong>{{ c.presenciales.totales.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td></td>
                  <td class="num"><strong>{{ c.presenciales.totales.montoRecibido | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td class="num" [class.debe]="c.presenciales.totales.monto - c.presenciales.totales.montoRecibido > 0">
                    <strong>{{ c.presenciales.totales.monto - c.presenciales.totales.montoRecibido | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
            <div class="pie no-imprimir">
              @if (c.presenciales.totales.pagosSinRegistrar > 0) {
                <span class="pendientes">{{ c.presenciales.totales.pagosSinRegistrar }} pago(s) sin registrar</span>
                <button
                  type="button"
                  class="pp-btn pp-btn--secundario pp-btn--chico"
                  [disabled]="guardando()"
                  (click)="pagaronExacto(c.presenciales.lineas, null)"
                >
                  Los que faltan pagaron exacto
                </button>
              } @else {
                <span class="listo">✓ Todos los pagos registrados</span>
              }
            </div>
          </section>
        }
      </div>

      <section class="pp-card resumen">
        <span>Total despachado en el día: <strong>{{ c.totalesDia.kg | number: '1.0-3' }} kg</strong></span>
        <span>Valor total: <strong>{{ c.totalesDia.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>{{ c.cerrada ? 'Día cerrado' : 'Día abierto (puede cambiar)' }}</span>
      </section>
    } @else if (cargando()) {
      <p class="pp-texto-suave">Calculando cuadre…</p>
    }

    <!-- Fila de cobro de un cliente (con su pago) -->
    <ng-template #fila let-l let-repartidorId="repartidorId" let-anterior="anterior">
      <tr [class.anterior]="anterior">
        <td>
          {{ l.cliente }}
          <small class="detalle">
            @if (anterior) {
              Pago del {{ cuadre()?.fechaAnterior | date: 'dd-MM' : 'UTC' }} ·
            }
            {{ guiasTexto(l) }}
          </small>
        </td>
        <td class="num">{{ l.kg | number: '1.0-3' }}</td>
        <td class="num">{{ l.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
        <td class="num" [class.debe]="l.saldoAnterior > 0" [class.favor]="l.saldoAnterior < 0">
          {{ l.saldoAnterior === 0 ? '—' : (l.saldoAnterior | currency: 'CLP' : 'symbol-narrow' : '1.0-0') }}
        </td>
        <td class="num">
          <input
            class="pago"
            type="number"
            inputmode="numeric"
            min="0"
            step="100"
            data-pago
            [class.sin-registrar]="l.pagado === null"
            [value]="l.pagado ?? ''"
            [placeholder]="l.monto"
            [attr.aria-label]="'Pagó ' + l.cliente"
            (keydown.enter)="siguiente($event)"
            (blur)="guardarPago(l, repartidorId, $any($event.target).value)"
          />
        </td>
        <td class="num" [class.debe]="queda(l) > 0" [class.favor]="queda(l) < 0">
          {{ l.pagado === null ? '' : (queda(l) | currency: 'CLP' : 'symbol-narrow' : '1.0-0') }}
        </td>
      </tr>
    </ng-template>
  `,
  styles: `
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .fecha {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .fecha input {
      min-height: 40px;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 600 1rem var(--pp-fuente);
    }
    .bloques {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 0.75rem;
      align-items: start;
      margin-bottom: 0.75rem;
    }
    .bloque {
      break-inside: avoid;
      padding: 0.75rem 0.9rem;
      font-size: 0.88rem;
    }
    .bloque .pp-tabla th,
    .bloque .pp-tabla td {
      padding: 0.3rem 0.4rem;
    }
    @media (max-width: 560px) {
      .bloques {
        grid-template-columns: 1fr;
      }
    }
    @media print {
      .bloques {
        grid-template-columns: 1fr;
      }
    }
    .bloque__cabecera {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .bloque__cabecera h2 {
      font-size: 1.15rem;
      color: var(--pp-celeste-oscuro);
      margin: 0;
    }
    .totales {
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .rendir strong {
      font-size: 1.2rem;
      color: var(--pp-celeste-oscuro);
    }
    .num {
      text-align: right;
    }
    .detalle {
      display: block;
      font-size: 0.72rem;
      color: var(--pp-texto-suave);
    }
    tr.anterior td {
      background: #fff8ec;
    }
    tfoot td {
      border-top: 2px solid var(--pp-borde);
    }
    .pago {
      width: 6.5rem;
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 600 0.9rem var(--pp-fuente);
      text-align: right;
    }
    .pago:focus {
      outline: 2px solid var(--pp-celeste);
      border-color: var(--pp-celeste);
    }
    .pago.sin-registrar {
      background: #fff8ec;
      border-color: #f3c27a;
    }
    .debe {
      color: var(--pp-error);
      font-weight: 600;
    }
    .favor {
      color: var(--pp-exito);
      font-weight: 600;
    }
    .pie {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 0.6rem;
      margin-top: 0.5rem;
      font-size: 0.82rem;
    }
    .pendientes {
      color: var(--pp-alerta);
      font-weight: 600;
    }
    .listo {
      color: var(--pp-exito);
      font-weight: 600;
    }
    .manana {
      font-size: 0.85rem;
      color: var(--pp-texto-suave);
      margin: 0.6rem 0 0;
    }
    .resumen {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .firmas {
      gap: 15mm;
      margin-top: 12mm;
      text-align: center;
      font-size: 9pt;
    }
    .firmas div {
      flex: 1;
    }
    .linea {
      display: block;
      border-top: 1px solid #333;
      margin-bottom: 1mm;
    }
    .solo-imprimir {
      display: none;
    }
    @media print {
      .solo-imprimir {
        display: block;
      }
      .firmas.solo-imprimir {
        display: flex;
      }
      .pago {
        border: none;
        background: none;
        width: auto;
      }
    }
  `,
})
export class CuadreComponent {
  private readonly api = inject(DespachoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly fecha = signal(hoyISO());
  protected readonly cuadre = signal<Cuadre | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  /** N° de guías de las vueltas del cliente; avisa si alguna entrega quedó sin guía */
  protected guiasTexto(l: LineaCuadre): string {
    const nums = l.guiaIds.map((id) => `N°${id}`).join(', ');
    const falta = l.sinGuia > 0 ? `${l.sinGuia} sin guía` : '';
    return [nums, falta].filter(Boolean).join(' · ') || 'sin guía';
  }

  /** Lo que el cliente queda debiendo después de este cuadre (negativo = a favor) */
  protected queda(l: LineaCuadre): number {
    return l.saldoAnterior + l.monto - (l.pagado ?? 0);
  }

  protected nombres(lineas: { cliente: string }[]): string {
    return lineas.map((l) => l.cliente).join(', ');
  }

  cambiarDia(dias: number): void {
    this.irA(sumarDias(this.fecha(), dias));
  }

  irA(fecha: string): void {
    if (!fecha) return;
    this.fecha.set(fecha);
    this.cargar();
  }

  /** silencioso = recarga sin vaciar la pantalla (después de guardar un pago) */
  cargar(silencioso = false): void {
    if (!silencioso) {
      this.cargando.set(true);
      this.cuadre.set(null);
    }
    this.error.set(null);
    this.api.cuadre(this.fecha()).subscribe({
      next: (c) => {
        this.cuadre.set(c);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo calcular el cuadre.'));
        this.cargando.set(false);
      },
    });
  }

  protected cobrosDe(r: CuadreRepartidor): LineaCuadre[] {
    return [...r.cobrosDelDia, ...r.cobrosPagoDiaAnterior];
  }

  /** Enter: pasa al siguiente cliente (al salir del campo se guarda el pago) */
  siguiente(evento: Event): void {
    evento.preventDefault();
    this.enfocarSiguiente(evento.target as HTMLInputElement);
  }

  /** Guarda lo que pagó un cliente al salir del campo. Vacío o 0 = no pagó. */
  guardarPago(l: LineaCuadre, repartidorId: number | null, valor: string): void {
    const texto = valor.trim();
    const monto = texto === '' ? 0 : Number(texto);
    if (!Number.isFinite(monto) || monto < 0 || !Number.isInteger(monto)) {
      this.error.set(`Monto inválido para ${l.cliente}: use pesos enteros, sin puntos.`);
      return;
    }
    // Sin cambios: no se guarda
    if ((l.pagado ?? 0) === monto && (l.pagado !== null || texto === '')) return;

    this.guardando.set(true);
    this.api.registrarPago(this.fecha(), l.clienteId, monto, repartidorId).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cargar(true);
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e, 'No se pudo guardar el pago.'));
      },
    });
  }

  /** Registra como pagado exactamente el monto del día a los clientes que aún no tienen pago */
  pagaronExacto(lineas: LineaCuadre[], repartidorId: number | null): void {
    const pendientes = lineas.filter((l) => l.pagado === null && l.monto > 0);
    if (pendientes.length === 0) return;
    const ok = confirm(
      `Se registrará que ${pendientes.length} cliente(s) pagaron exactamente el monto del día:\n` +
        pendientes.map((l) => `· ${l.cliente}`).join('\n'),
    );
    if (!ok) return;
    this.guardando.set(true);
    forkJoin(pendientes.map((l) => this.api.registrarPago(this.fecha(), l.clienteId, l.monto, repartidorId))).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cargar(true);
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e, 'No se pudieron registrar todos los pagos.'));
        this.cargar(true);
      },
    });
  }

  private enfocarSiguiente(actual: HTMLInputElement): void {
    const inputs = Array.from(this.host.nativeElement.querySelectorAll<HTMLInputElement>('input[data-pago]'));
    const siguiente = inputs[inputs.indexOf(actual) + 1];
    if (siguiente) {
      siguiente.focus();
      siguiente.select();
    } else {
      actual.blur();
    }
  }

  imprimir(): void {
    window.print();
  }
}
