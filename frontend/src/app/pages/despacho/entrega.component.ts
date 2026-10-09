import { CurrencyPipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { CargoEntrega, Entrega, FilaEntrega } from '../../core/models';
import { DespachoService, hoyISO, sumarDias } from './despacho.service';

/**
 * [DESPACHO] Entrega del día: lo que cada repartidor debe entregar, calculado desde la planilla.
 * Reemplaza al cuadre con pagos y a la pestaña de saldos: se asume que todos pagan,
 * y solo se anotan las excepciones ("no pagó"), que pasan al próximo día en que el cliente reciba pan.
 */
@Component({
  selector: 'app-entrega',
  imports: [CurrencyPipe, DecimalPipe, NgTemplateOutlet, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Entrega del día</h1>
        <p class="pp-texto-suave">
          Lo que cada repartidor debe entregar hoy. Si un cliente no pagó, márquelo: su monto pasa al próximo día en que reciba pan.
        </p>
      </div>
      <div class="fecha no-imprimir">
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(-1)" aria-label="Día anterior">◀</button>
        <input type="date" [value]="fecha()" (change)="irA($any($event.target).value)" aria-label="Fecha" />
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(1)" aria-label="Día siguiente">▶</button>
        <button type="button" class="pp-btn pp-btn--chico" (click)="imprimir()">Imprimir</button>
      </div>
      <p class="solo-imprimir">Fecha: <strong>{{ dia(fecha()) }}</strong></p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (entrega(); as e) {
      @if (e.repartidorUnico) {
        <p class="unico">
          Hoy repartió solo <strong>{{ e.repartidorUnico.nombre }}</strong>: se le cuadra toda la planilla y cobra todo lo del día anterior.
          <a routerLink="/despacho/planilla" class="no-imprimir">Cambiar en la planilla</a>
        </p>
      }
      @if (e.totalesDia.sinGuia > 0) {
        <p class="pp-alerta-error no-imprimir">{{ e.totalesDia.sinGuia }} entrega(s) del día aún no tienen guía emitida.</p>
      }
      @if (e.sinRepartidor.length > 0) {
        <p class="pp-alerta-error">Sin repartidor asignado (revise en Clientes): {{ e.sinRepartidor.join(', ') }}.</p>
      }

      <div class="bloques">
        @for (r of e.repartidores; track r.repartidor.id) {
          <section class="pp-card bloque">
            <div class="bloque__cabecera">
              <h2>{{ r.repartidor.nombre }}{{ r.repartidor.patente ? ' · ' + r.repartidor.patente : '' }}</h2>
              <div class="entregar">
                Debe entregar
                <strong>{{ r.totales.montoEntregar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
              </div>
            </div>
            <div class="kilos">
              <span>Kg del día: <strong>{{ r.totales.kgDelDia | number: '1.0-3' }}</strong></span>
              <span>+ Kg día anterior: <strong>{{ r.totales.kgDiaAnterior | number: '1.0-3' }}</strong></span>
              <span>= <strong>{{ r.totales.kgDelDia + r.totales.kgDiaAnterior | number: '1.0-3' }} kg</strong></span>
            </div>

            <ng-container *ngTemplateOutlet="tabla; context: { titulo: 'Clientes del día', filas: r.cobrosDelDia, anteriores: false }" />
            <ng-container
              *ngTemplateOutlet="tabla; context: { titulo: 'Pagan lo del día anterior', filas: r.cobrosDiaAnterior, anteriores: true }"
            />
            <ng-container *ngTemplateOutlet="noPagaron; context: { filas: r.noPagaron, total: r.totales.montoNoPagado }" />

            @if (r.pagaDespues.length > 0) {
              <p class="despues">
                Repartió hoy {{ r.totales.kgRepartidos | number: '1.0-3' }} kg. De ellos, pagan el próximo día con pan:
                @for (f of r.pagaDespues; track f.clienteId; let ultimo = $last) {
                  {{ f.cliente }} ({{ f.kg | number: '1.0-3' }} kg){{ ultimo ? '.' : ',' }}
                }
              </p>
            }

            <div class="firmas solo-imprimir">
              <div><span class="linea"></span>Entrega (repartidor)</div>
              <div><span class="linea"></span>Recibe (despachador)</div>
            </div>
          </section>
        } @empty {
          <section class="pp-card"><p class="pp-texto-suave">No hay reparto ni cobros para esta fecha.</p></section>
        }

        @if (e.presenciales.cobros.length + e.presenciales.noPagaron.length > 0) {
          <section class="pp-card bloque">
            <div class="bloque__cabecera">
              <h2>Presenciales (panadería)</h2>
              <div class="entregar">
                Total
                <strong>{{ e.presenciales.totales.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
              </div>
            </div>
            <div class="kilos">
              <span>Kg: <strong>{{ e.presenciales.totales.kg | number: '1.0-3' }}</strong></span>
            </div>
            <ng-container *ngTemplateOutlet="tabla; context: { titulo: 'Clientes', filas: e.presenciales.cobros, anteriores: false }" />
            <ng-container *ngTemplateOutlet="noPagaron; context: { filas: e.presenciales.noPagaron, total: e.presenciales.totales.montoNoPagado }" />
          </section>
        }
      </div>

      @if (e.pendientes.length > 0) {
        <section class="pp-card pendientes">
          <h2>Pendientes de cobro</h2>
          <p class="pp-texto-suave">Clientes que hoy no recibieron pan. Se les cobra automáticamente el próximo día en que reciban.</p>
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Desde</th>
                <th class="num">Kg</th>
                <th class="num">Monto</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              @for (p of e.pendientes; track p.clienteId) {
                <tr>
                  <td>{{ p.cliente }}{{ p.activo ? '' : ' (inactivo)' }}</td>
                  <td>{{ dia(p.desde) }}</td>
                  <td class="num">{{ p.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ p.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="motivo">{{ motivo(p.motivo) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <section class="pp-card resumen">
        <span>Despachado hoy: <strong>{{ e.totalesDia.kg | number: '1.0-3' }} kg</strong> ({{ e.totalesDia.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }})</span>
        <span>Total a recibir hoy: <strong>{{ e.totalesDia.montoEntregar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>{{ e.cerrada ? 'Día cerrado' : 'Día abierto (puede cambiar)' }}</span>
      </section>
    } @else if (cargando()) {
      <p class="pp-texto-suave">Calculando…</p>
    }

    <!-- Tabla de clientes que pagan hoy -->
    <ng-template #tabla let-titulo="titulo" let-filas="filas" let-anteriores="anteriores">
      @if (filas.length > 0) {
        <h3>{{ titulo }}</h3>
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th class="num">Kg</th>
              <th class="num">Monto</th>
              <th class="no-imprimir"></th>
            </tr>
          </thead>
          <tbody>
            @for (f of filasDe(filas); track f.clienteId) {
              <tr [class.anterior]="anteriores">
                <td>
                  {{ f.cliente }}
                  @if (detalle(f); as d) {
                    <small class="detalle">{{ d }}</small>
                  }
                </td>
                <td class="num">{{ f.kg | number: '1.0-3' }}</td>
                <td class="num">{{ f.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="accion no-imprimir">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="guardando()" (click)="marcarNoPago(f)">
                    No pagó
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </ng-template>

    <!-- Clientes marcados como "no pagó" hoy -->
    <ng-template #noPagaron let-filas="filas" let-total="total">
      @if (filas.length > 0) {
        <h3 class="rojo">No pagaron hoy ({{ total | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}, no se suma)</h3>
        <ul class="nopago">
          @for (f of filasDe(filas); track f.clienteId) {
            <li>
              <span>
                <strong>{{ f.cliente }}</strong> · {{ f.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                ({{ diasDe(f.cargos) }}){{ f.noPago?.nota ? ' · ' + f.noPago?.nota : '' }}
              </span>
              <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico no-imprimir" [disabled]="guardando()" (click)="quitarNoPago(f)">
                Sí pagó
              </button>
            </li>
          }
        </ul>
      }
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
    .unico {
      padding: 0.5rem 0.75rem;
      background: var(--pp-celeste-claro);
      border-left: 4px solid var(--pp-celeste);
      border-radius: 6px;
    }
    .unico a {
      margin-left: 0.5rem;
      font-size: 0.85rem;
    }
    .bloques {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 0.75rem;
      align-items: start;
      margin-bottom: 0.75rem;
    }
    @media (max-width: 560px) {
      .bloques {
        grid-template-columns: 1fr;
      }
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
    .bloque__cabecera {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .bloque__cabecera h2 {
      font-size: 1.15rem;
      color: var(--pp-celeste-oscuro);
      margin: 0;
    }
    .entregar strong {
      display: block;
      text-align: right;
      font-size: 1.5rem;
      color: var(--pp-celeste-oscuro);
    }
    .kilos {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1rem;
      margin: 0.35rem 0 0.5rem;
      padding: 0.35rem 0.5rem;
      background: #f6f9fc;
      border-radius: 6px;
    }
    h3 {
      font-size: 0.92rem;
      margin: 0.75rem 0 0.3rem;
    }
    h3.rojo {
      color: var(--pp-error);
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .accion {
      text-align: right;
      width: 1%;
    }
    .detalle {
      display: block;
      font-size: 0.72rem;
      color: var(--pp-texto-suave);
    }
    tr.anterior td {
      background: #fff8ec;
    }
    .nopago {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .nopago li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0.4rem;
      border-bottom: 1px solid var(--pp-borde);
      background: #fdecec;
    }
    .despues {
      font-size: 0.82rem;
      color: var(--pp-texto-suave);
      margin: 0.6rem 0 0;
    }
    .pendientes {
      margin-bottom: 0.75rem;
    }
    .pendientes h2 {
      font-size: 1.05rem;
      margin: 0;
    }
    .pendientes p {
      margin: 0.2rem 0 0.5rem;
    }
    .motivo {
      font-size: 0.82rem;
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
      .bloques {
        grid-template-columns: 1fr;
      }
      .solo-imprimir {
        display: block;
      }
      .firmas.solo-imprimir {
        display: flex;
      }
    }
  `,
})
export class EntregaComponent {
  private readonly api = inject(DespachoService);

  protected readonly fecha = signal(hoyISO());
  protected readonly entrega = signal<Entrega | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  /** Permite tipar las filas que llegan por el contexto de las plantillas */
  protected filasDe(filas: FilaEntrega[]): FilaEntrega[] {
    return filas;
  }

  /** "vie 10-10" */
  protected dia(fecha: string): string {
    const nombre = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '');
    return `${nombre} ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;
  }

  protected diasDe(cargos: CargoEntrega[]): string {
    return cargos.map((c) => this.dia(c.fecha)).join(', ');
  }

  /** Aclara qué días se están cobrando cuando no es solo lo de hoy (o solo ayer, en pago día siguiente) */
  protected detalle(f: FilaEntrega): string | null {
    if (f.modalidad === 'PAGO_DIA_SIGUIENTE') return `Lo del ${this.diasDe(f.cargos)}`;
    const anteriores = f.cargos.filter((c) => c.fecha !== this.fecha());
    if (anteriores.length === 0) return null;
    return `Incluye lo no pagado del ${this.diasDe(anteriores)}`;
  }

  /** Muestra las fechas del motivo en formato corto */
  protected motivo(texto: string): string {
    return texto.replace(/\d{4}-\d{2}-\d{2}/g, (f) => this.dia(f));
  }

  cambiarDia(dias: number): void {
    this.irA(sumarDias(this.fecha(), dias));
  }

  irA(fecha: string): void {
    if (!fecha) return;
    this.fecha.set(fecha);
    this.entrega.set(null);
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(this.entrega() === null);
    this.error.set(null);
    this.api.entrega(this.fecha()).subscribe({
      next: (e) => {
        this.entrega.set(e);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(mensajeError(err, 'No se pudo calcular la entrega del día.'));
        this.cargando.set(false);
      },
    });
  }

  marcarNoPago(f: FilaEntrega): void {
    const nota = prompt(
      `${f.cliente} no pagó ${f.monto.toLocaleString('es-CL')} pesos.\n` +
        'Ese monto se le cobrará el próximo día en que reciba pan.\n\nNota (opcional):',
      '',
    );
    if (nota === null) return;
    this.guardando.set(true);
    this.api.marcarNoPago(this.fecha(), f.clienteId, nota.trim() || null).subscribe({
      next: () => this.terminado(),
      error: (e) => this.fallo(e, 'No se pudo marcar.'),
    });
  }

  quitarNoPago(f: FilaEntrega): void {
    this.guardando.set(true);
    this.api.quitarNoPago(this.fecha(), f.clienteId).subscribe({
      next: () => this.terminado(),
      error: (e) => this.fallo(e, 'No se pudo quitar la marca.'),
    });
  }

  private terminado(): void {
    this.guardando.set(false);
    this.cargar();
  }

  private fallo(e: unknown, texto: string): void {
    this.guardando.set(false);
    this.error.set(mensajeError(e, texto));
  }

  imprimir(): void {
    window.print();
  }
}
