import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { EstadoCuenta, NOMBRE_MODALIDAD, SaldoCliente } from '../../core/models';
import { DespachoService, hoyISO, sumarDias } from './despacho.service';

/** [DESPACHO] Saldos pendientes por cliente y estado de cuenta */
@Component({
  selector: 'app-saldos',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado no-imprimir">
      <div>
        <h1>Pagos y saldos</h1>
        <p class="pp-texto-suave">
          Saldo = lo despachado − lo pagado. Los pagos se anotan en el Cuadre de cada día.
        </p>
      </div>
      <div class="resumen-deuda">
        <span>Deuda total</span>
        <strong>{{ totalDeuda() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
        <small>{{ conDeuda() }} cliente(s)</small>
      </div>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <div class="contenido" [class.con-detalle]="cuenta() !== null">
      <section class="pp-card no-imprimir">
        <div class="filtros">
          <input type="search" placeholder="Buscar cliente…" (input)="busqueda.set($any($event.target).value)" aria-label="Buscar cliente" />
          <label class="check">
            <input type="checkbox" [checked]="soloDeuda()" (change)="soloDeuda.set($any($event.target).checked)" />
            Solo con saldo pendiente
          </label>
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="exportar()">Exportar Excel (CSV)</button>
        </div>

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Modalidad</th>
                <th class="num">Saldo</th>
                <th class="num" title="Pago día siguiente entregado que aún no corresponde cobrar">Por cobrar</th>
                <th>Último pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (s of visibles(); track s.clienteId) {
                <tr [class.seleccionado]="cuenta()?.cliente.id === s.clienteId">
                  <td>
                    {{ s.cliente }}
                    @if (!s.activo) {
                      <span class="pp-chip inactivo">inactivo</span>
                    }
                  </td>
                  <td>
                    {{ nombreModalidad[s.modalidad] }}
                    @if (s.repartidor) {
                      <small class="sub">{{ s.repartidor.nombre }}</small>
                    }
                  </td>
                  <td class="num" [class.debe]="s.saldo > 0" [class.favor]="s.saldo < 0">
                    {{ s.saldo === 0 ? 'Al día' : (s.saldo | currency: 'CLP' : 'symbol-narrow' : '1.0-0') }}
                  </td>
                  <td class="num">{{ s.porCobrar ? (s.porCobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : '—' }}</td>
                  <td>{{ s.ultimoPago ? (s.ultimoPago | date: 'dd-MM-yyyy' : 'UTC') : '—' }}</td>
                  <td class="acciones">
                    <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="verCuenta(s.clienteId)">
                      Estado de cuenta
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="pp-texto-suave">
                    {{ cargando() ? 'Calculando saldos…' : soloDeuda() ? 'Ningún cliente tiene saldo pendiente.' : 'Sin clientes.' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (cuenta(); as c) {
        <section class="pp-card cuenta">
          <div class="cuenta__cabecera">
            <div>
              <h2>{{ c.cliente.nombre }}</h2>
              <p class="pp-texto-suave">
                {{ nombreModalidad[c.cliente.modalidad] }}{{ c.cliente.repartidor ? ' · ' + c.cliente.repartidor.nombre : '' }}
              </p>
            </div>
            <div class="no-imprimir botones">
              <button type="button" class="pp-btn pp-btn--chico" (click)="imprimir()">Imprimir</button>
              <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cuenta.set(null)">Cerrar</button>
            </div>
          </div>

          <div class="rango no-imprimir">
            <label>Desde <input type="date" [value]="desde()" (change)="cambiarRango($any($event.target).value, hasta())" /></label>
            <label>Hasta <input type="date" [value]="hasta()" (change)="cambiarRango(desde(), $any($event.target).value)" /></label>
          </div>
          <p class="solo-imprimir">
            Estado de cuenta del {{ c.desde | date: 'dd-MM-yyyy' : 'UTC' }} al {{ c.hasta | date: 'dd-MM-yyyy' : 'UTC' }}
          </p>

          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Detalle</th>
                <th class="num">Despachado</th>
                <th class="num">Pagado</th>
                <th class="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr class="inicial">
                <td colspan="4">Saldo al {{ c.desde | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                <td class="num">{{ c.saldoInicial | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
              </tr>
              @for (m of c.movimientos; track m.fecha) {
                <tr>
                  <td>{{ m.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                  <td class="sub">
                    @for (d of m.despachos; track d.fechaDespacho) {
                      {{ d.kg | number: '1.0-3' }} kg{{ d.fechaDespacho !== m.fecha ? ' (pan del ' + (d.fechaDespacho | date: 'dd-MM' : 'UTC') + ')' : '' }}
                    }
                    @if (m.pagado > 0) {
                      · recibió {{ m.recibidoPor }}
                    }
                  </td>
                  <td class="num">{{ m.cargo ? (m.cargo | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : '—' }}</td>
                  <td class="num">{{ m.pagado ? (m.pagado | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : '—' }}</td>
                  <td class="num" [class.debe]="m.saldo > 0" [class.favor]="m.saldo < 0">
                    {{ m.saldo | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="pp-texto-suave">Sin movimientos en el período.</td></tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><strong>Totales del período</strong></td>
                <td class="num"><strong>{{ c.totales.cargo | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                <td class="num"><strong>{{ c.totales.pagado | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                <td class="num" [class.debe]="c.saldoFinal > 0" [class.favor]="c.saldoFinal < 0">
                  <strong>{{ c.saldoFinal | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
          @if (c.porCobrar > 0) {
            <p class="pp-texto-suave nota">
              Además tiene {{ c.porCobrar | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }} de pan entregado que se cobra el próximo día trabajado.
            </p>
          }
        </section>
      }
    </div>
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
    .resumen-deuda {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: 0.5rem 1rem;
      border: 2px solid var(--pp-celeste-medio);
      border-radius: var(--pp-radio);
      background: var(--pp-blanco);
    }
    .resumen-deuda strong {
      font-size: 1.4rem;
      color: var(--pp-error);
    }
    .resumen-deuda small,
    .resumen-deuda span {
      font-size: 0.8rem;
      color: var(--pp-texto-suave);
    }
    .contenido {
      display: grid;
      gap: 0.75rem;
      align-items: start;
    }
    .contenido.con-detalle {
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    }
    @media (max-width: 1100px) {
      .contenido.con-detalle {
        grid-template-columns: 1fr;
      }
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 0.6rem;
    }
    .filtros input[type='search'] {
      min-height: 36px;
      padding: 0.3rem 0.6rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.88rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla {
      font-size: 0.88rem;
    }
    .pp-tabla th,
    .pp-tabla td {
      padding: 0.3rem 0.45rem;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .sub {
      display: block;
      font-size: 0.75rem;
      color: var(--pp-texto-suave);
    }
    td.sub {
      display: table-cell;
    }
    .acciones {
      text-align: right;
    }
    .debe {
      color: var(--pp-error);
      font-weight: 600;
    }
    .favor {
      color: var(--pp-exito);
      font-weight: 600;
    }
    .inactivo {
      background: #eee;
      color: var(--pp-texto-suave);
    }
    tr.seleccionado td {
      background: var(--pp-celeste-claro);
    }
    tr.inicial td {
      font-style: italic;
      color: var(--pp-texto-suave);
    }
    tfoot td {
      border-top: 2px solid var(--pp-borde);
    }
    .cuenta__cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .cuenta__cabecera h2 {
      margin: 0;
      color: var(--pp-celeste-oscuro);
      font-size: 1.2rem;
    }
    .cuenta__cabecera p {
      margin: 0;
    }
    .botones button + button {
      margin-left: 0.35rem;
    }
    .rango {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin: 0.6rem 0;
      font-size: 0.85rem;
    }
    .rango input {
      margin-left: 0.3rem;
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 0.85rem var(--pp-fuente);
    }
    .nota {
      font-size: 0.82rem;
      margin: 0.5rem 0 0;
    }
    .solo-imprimir {
      display: none;
    }
    @media print {
      .solo-imprimir {
        display: block;
      }
      .contenido.con-detalle {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class SaldosComponent {
  private readonly api = inject(DespachoService);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly saldos = signal<SaldoCliente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busqueda = signal('');
  protected readonly soloDeuda = signal(true);

  protected readonly cuenta = signal<EstadoCuenta | null>(null);
  protected readonly desde = signal(sumarDias(hoyISO(), -30));
  protected readonly hasta = signal(hoyISO());
  private clienteCuenta: number | null = null;

  protected readonly visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.saldos().filter(
      (s) => (!this.soloDeuda() || s.saldo > 0) && (!q || s.cliente.toLowerCase().includes(q)),
    );
  });
  protected readonly totalDeuda = computed(() => this.saldos().reduce((t, s) => t + Math.max(s.saldo, 0), 0));
  protected readonly conDeuda = computed(() => this.saldos().filter((s) => s.saldo > 0).length);

  constructor() {
    this.api.saldos().subscribe({
      next: (s) => {
        this.saldos.set(s);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron calcular los saldos.'));
        this.cargando.set(false);
      },
    });
  }

  verCuenta(clienteId: number): void {
    this.clienteCuenta = clienteId;
    this.cargarCuenta();
  }

  cambiarRango(desde: string, hasta: string): void {
    if (!desde || !hasta) return;
    this.desde.set(desde);
    this.hasta.set(hasta);
    this.cargarCuenta();
  }

  private cargarCuenta(): void {
    if (this.clienteCuenta === null) return;
    this.error.set(null);
    this.api.estadoCuenta(this.clienteCuenta, this.desde(), this.hasta()).subscribe({
      next: (c) => this.cuenta.set(c),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el estado de cuenta.')),
    });
  }

  exportar(): void {
    descargarCsv(`saldos-clientes-${hoyISO()}.csv`, [
      ['Cliente', 'Modalidad', 'Repartidor', 'Total despachado', 'Total pagado', 'Saldo', 'Por cobrar', 'Último pago'],
      ...this.visibles().map((s) => [
        s.cliente,
        this.nombreModalidad[s.modalidad],
        s.repartidor?.nombre ?? '',
        s.totalDespachado,
        s.totalPagado,
        s.saldo,
        s.porCobrar,
        s.ultimoPago ?? '',
      ]),
    ]);
  }

  imprimir(): void {
    window.print();
  }
}
