import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { mensajeError } from '../../core/errores';
import { Cuadre } from '../../core/models';
import { DespachoService, hoyISO, sumarDias } from './despacho.service';

/** [DESPACHO] Cuadre automático por repartidor (kg entregados y dinero a rendir) */
@Component({
  selector: 'app-cuadre',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <div>
        <h1>Cuadre del día</h1>
        <p class="pp-texto-suave">Calculado desde la planilla. Los clientes de "pago día siguiente" se cobran el día trabajado siguiente.</p>
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
        <p class="pp-alerta-error no-imprimir">{{ c.totalesDia.sinGuia }} cliente(s) del día aún no tienen guía emitida.</p>
      }

      @for (r of c.repartidores; track r.repartidor.id) {
        <section class="pp-card bloque">
          <div class="bloque__cabecera">
            <h2>{{ r.repartidor.nombre }} {{ r.repartidor.patente ? '· ' + r.repartidor.patente : '' }}</h2>
            <div class="totales">
              <span>Kg entregados hoy: <strong>{{ r.totales.kgEntregados | number: '1.0-3' }}</strong></span>
              <span class="rendir">Debe rendir: <strong>{{ r.totales.montoACobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
            </div>
          </div>

          <table class="pp-tabla">
            <thead>
              <tr><th>Cliente</th><th class="num">Kg</th><th class="num">Precio kg</th><th class="num">Monto</th><th>Guía</th><th>Concepto</th></tr>
            </thead>
            <tbody>
              @for (l of r.cobrosDelDia; track l.clienteId) {
                <tr>
                  <td>{{ l.cliente }}</td>
                  <td class="num">{{ l.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ l.precioKg | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ l.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td>{{ l.guiaId ?? 'sin guía' }}</td>
                  <td>Cobro del día</td>
                </tr>
              }
              @for (l of r.cobrosPagoDiaAnterior; track l.clienteId) {
                <tr class="anterior">
                  <td>{{ l.cliente }}</td>
                  <td class="num">{{ l.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ l.precioKg | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ l.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td>{{ l.guiaId ?? 'sin guía' }}</td>
                  <td>Pago del {{ c.fechaAnterior | date: 'dd-MM' : 'UTC' }}</td>
                </tr>
              }
              @if (r.cobrosDelDia.length + r.cobrosPagoDiaAnterior.length === 0) {
                <tr><td colspan="6" class="pp-texto-suave">Sin cobros hoy.</td></tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3"><strong>Total a rendir</strong></td>
                <td class="num"><strong>{{ r.totales.montoACobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>

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
              <tr><th>Cliente</th><th class="num">Kg</th><th class="num">Monto</th><th>Guía</th></tr>
            </thead>
            <tbody>
              @for (l of c.presenciales.lineas; track l.clienteId) {
                <tr>
                  <td>{{ l.cliente }}</td>
                  <td class="num">{{ l.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ l.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td>{{ l.guiaId ?? 'sin guía' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <section class="pp-card resumen">
        <span>Total despachado en el día: <strong>{{ c.totalesDia.kg | number: '1.0-3' }} kg</strong></span>
        <span>Valor total: <strong>{{ c.totalesDia.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>{{ c.cerrada ? 'Día cerrado' : 'Día abierto (puede cambiar)' }}</span>
      </section>
    } @else if (cargando()) {
      <p class="pp-texto-suave">Calculando cuadre…</p>
    }
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
    .bloque {
      margin-bottom: 1rem;
      break-inside: avoid;
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
    tr.anterior td {
      background: #fff8ec;
    }
    tfoot td {
      border-top: 2px solid var(--pp-borde);
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
    }
  `,
})
export class CuadreComponent {
  private readonly api = inject(DespachoService);

  protected readonly fecha = signal(hoyISO());
  protected readonly cuadre = signal<Cuadre | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.cargar();
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

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.cuadre.set(null);
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

  imprimir(): void {
    window.print();
  }
}
