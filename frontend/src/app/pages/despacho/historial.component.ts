import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import {
  Cliente,
  FiltroHistorial,
  Historial,
  ModalidadCliente,
  NOMBRE_MODALIDAD,
  NOMBRE_VUELTA,
  Repartidor,
  VUELTAS,
  Vuelta,
} from '../../core/models';
import { DespachoService, hoyISO, sumarDias } from './despacho.service';

/** [DESPACHO] Historial de despachos por fecha, cliente, repartidor o vuelta */
@Component({
  selector: 'app-historial',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Historial de despachos</h1>
      <p class="pp-texto-suave">Qué se entregó, a quién, en qué vuelta y con qué repartidor. Útil para revisar reclamos.</p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); buscar(desde.value, hasta.value, cliente.value, repartidor.value, vuelta.value, modalidad.value)">
        <label>Desde <input #desde type="date" [value]="filtro().desde" required /></label>
        <label>Hasta <input #hasta type="date" [value]="filtro().hasta" required /></label>
        <label>
          Cliente
          <select #cliente>
            <option value="">Todos</option>
            @for (c of clientes(); track c.id) {
              <option [value]="c.id">{{ c.nombre }}</option>
            }
          </select>
        </label>
        <label>
          Repartidor
          <select #repartidor>
            <option value="">Todos</option>
            @for (r of repartidores(); track r.id) {
              <option [value]="r.id">{{ r.nombre }}</option>
            }
          </select>
        </label>
        <label>
          Vuelta
          <select #vuelta>
            <option value="">Todas</option>
            @for (v of vueltas; track v) {
              <option [value]="v">{{ nombreVuelta[v] }}</option>
            }
          </select>
        </label>
        <label>
          Modalidad
          <select #modalidad>
            <option value="">Todas</option>
            @for (m of modalidades; track m) {
              <option [value]="m">{{ nombreModalidad[m] }}</option>
            }
          </select>
        </label>
        <button type="submit" class="pp-btn pp-btn--chico">Buscar</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="!historial()?.filas.length" (click)="exportar()">
          Exportar Excel (CSV)
        </button>
      </form>

      @if (historial(); as h) {
        <div class="totales">
          <span><strong>{{ h.totales.registros }}</strong> entregas</span>
          <span><strong>{{ h.totales.dias }}</strong> día(s)</span>
          <span><strong>{{ h.totales.kg | number: '1.0-3' }}</strong> kg</span>
          <span><strong>{{ h.totales.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
          @if (h.totales.sinGuia > 0) {
            <span class="alerta">{{ h.totales.sinGuia }} sin guía vigente</span>
          }
        </div>
        @if (h.truncado) {
          <p class="pp-alerta-error">Hay demasiados resultados; se muestran los primeros {{ h.filas.length }}. Acote las fechas o filtros.</p>
        }

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vuelta</th>
                <th>Cliente</th>
                <th>Repartidor</th>
                <th class="num">Kg</th>
                <th class="num">Desc.</th>
                <th class="num">Precio kg</th>
                <th class="num">Monto</th>
                <th>Guía</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              @for (f of h.filas; track f.id) {
                <tr>
                  <td class="nowrap">{{ f.fecha | date: 'EEE dd-MM-yyyy' : 'UTC' }}</td>
                  <td>{{ nombreVuelta[f.vuelta] }}</td>
                  <td>{{ f.cliente.nombre }}</td>
                  <td>{{ f.repartidor?.nombre ?? 'Presencial' }}</td>
                  <td class="num">{{ f.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ f.kgDescuento ? (f.kgDescuento | number: '1.0-3') : '' }}</td>
                  <td class="num">{{ f.precioKg | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ f.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="nowrap">
                    @for (g of f.guias; track g.id) {
                      @if (g.estado === 'VIGENTE') {
                        <span class="guia" [class.pendiente]="g.impresiones === 0" [title]="g.impresiones === 0 ? 'Emitida, sin imprimir' : 'Impresa ' + g.impresiones + ' vez/veces'">N°{{ g.id }}</span>
                      } @else {
                        <span class="guia anulada" [title]="'Anulada: ' + (g.motivoAnulacion ?? '')">N°{{ g.id }}</span>
                      }
                    } @empty {
                      <span class="sin-guia">sin guía</span>
                    }
                  </td>
                  <td class="sub">{{ f.registradoPor ?? '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="pp-texto-suave">No hay despachos para esos filtros.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (cargando()) {
        <p class="pp-texto-suave">Buscando…</p>
      }
    </section>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
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
    .filtros input,
    .filtros select {
      min-height: 36px;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
      color: var(--pp-texto);
    }
    .totales {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.6rem;
      background: var(--pp-celeste-claro);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .alerta {
      color: var(--pp-alerta);
      font-weight: 600;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla {
      font-size: 0.86rem;
    }
    .pp-tabla th,
    .pp-tabla td {
      padding: 0.28rem 0.45rem;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .nowrap {
      white-space: nowrap;
    }
    .sub {
      font-size: 0.78rem;
      color: var(--pp-texto-suave);
    }
    .guia {
      display: inline-block;
      padding: 0 0.35rem;
      margin-right: 0.2rem;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      background: #e3f6ea;
      color: var(--pp-exito);
    }
    .guia.pendiente {
      background: #fff1dc;
      color: var(--pp-alerta);
    }
    .guia.anulada {
      background: #fdecec;
      color: var(--pp-error);
      text-decoration: line-through;
    }
    .sin-guia {
      font-size: 0.78rem;
      color: var(--pp-alerta);
    }
  `,
})
export class HistorialComponent {
  private readonly api = inject(DespachoService);

  protected readonly nombreVuelta = NOMBRE_VUELTA;
  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly vueltas = VUELTAS;
  protected readonly modalidades = Object.keys(NOMBRE_MODALIDAD) as ModalidadCliente[];

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly repartidores = signal<Repartidor[]>([]);
  protected readonly filtro = signal<FiltroHistorial>({ desde: sumarDias(hoyISO(), -6), hasta: hoyISO() });
  protected readonly historial = signal<Historial | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.clientes(true).subscribe({ next: (c) => this.clientes.set(c) });
    this.api.repartidores(true).subscribe({ next: (r) => this.repartidores.set(r) });
    this.cargar();
  }

  buscar(desde: string, hasta: string, clienteId: string, repartidorId: string, vuelta: string, modalidad: string): void {
    if (!desde || !hasta) {
      this.error.set('Indique las fechas desde y hasta.');
      return;
    }
    this.filtro.set({
      desde,
      hasta,
      clienteId: clienteId ? Number(clienteId) : undefined,
      repartidorId: repartidorId ? Number(repartidorId) : undefined,
      vuelta: vuelta ? (Number(vuelta) as Vuelta) : undefined,
      modalidad: (modalidad || undefined) as ModalidadCliente | undefined,
    });
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.historial.set(null);
    this.api.historial(this.filtro()).subscribe({
      next: (h) => {
        this.historial.set(h);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo cargar el historial.'));
        this.cargando.set(false);
      },
    });
  }

  exportar(): void {
    const h = this.historial();
    if (!h) return;
    const f = this.filtro();
    descargarCsv(`historial-despachos-${f.desde}-a-${f.hasta}.csv`, [
      ['Fecha', 'Vuelta', 'Cliente', 'Modalidad', 'Repartidor', 'Kg', 'Kg descuento', 'Precio kg', 'Monto', 'Guía vigente', 'Guías anuladas', 'Registró'],
      ...h.filas.map((r) => [
        r.fecha,
        this.nombreVuelta[r.vuelta],
        r.cliente.nombre,
        this.nombreModalidad[r.cliente.modalidad],
        r.repartidor?.nombre ?? 'Presencial',
        r.kg,
        r.kgDescuento,
        r.precioKg,
        r.monto,
        r.guias.filter((g) => g.estado === 'VIGENTE').map((g) => g.id).join(' '),
        r.guias.filter((g) => g.estado === 'ANULADA').map((g) => g.id).join(' '),
        r.registradoPor ?? '',
      ]),
    ]);
  }
}
