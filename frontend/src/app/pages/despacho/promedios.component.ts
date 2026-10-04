import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { ModalidadCliente, NOMBRE_MODALIDAD, PromedioMensual, Repartidor } from '../../core/models';
import { DespachoService, hoyISO } from './despacho.service';

const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Mes 'AAAA-MM' desplazado n meses */
function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** [DESPACHO] Promedio mensual de kg por cliente, con gráfico y alerta de variaciones */
@Component({
  selector: 'app-promedios',
  imports: [DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Promedio mensual por cliente</h1>
      <p class="pp-texto-suave">
        Kg despachados por mes según la planilla. Se marca en naranja a quien cambió su promedio diario
        en más de un {{ datos()?.umbralVariacion ?? 30 }} % el último mes.
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); buscar(desde.value, hasta.value, repartidor.value, modalidad.value)">
        <label>Desde <input #desde type="month" [value]="desdeMes()" required /></label>
        <label>Hasta <input #hasta type="month" [value]="hastaMes()" required /></label>
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
          Modalidad
          <select #modalidad>
            <option value="">Todas</option>
            @for (m of modalidades; track m) {
              <option [value]="m">{{ nombreModalidad[m] }}</option>
            }
          </select>
        </label>
        <button type="submit" class="pp-btn pp-btn--chico">Ver</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="!datos()?.filas.length" (click)="exportar()">
          Exportar Excel (CSV)
        </button>
      </form>

      @if (datos(); as d) {
        <!-- Gráfico: kg totales por mes -->
        <div class="grafico" role="img" [attr.aria-label]="'Kg despachados por mes'">
          @for (m of d.meses; track m; let i = $index) {
            <div class="columna">
              <span class="valor">{{ d.totalesPorMes[i] | number: '1.0-0' }}</span>
              <div class="barra-mes" [style.height.%]="pct(d.totalesPorMes[i], maxMes())"></div>
              <span class="mes">{{ etiquetaMes(m) }}</span>
            </div>
          }
        </div>

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                @for (m of d.meses; track m) {
                  <th class="num">{{ etiquetaMes(m) }}</th>
                }
                <th class="num">Total kg</th>
                <th class="col-prom">Promedio mensual</th>
                <th class="num" title="Kg promedio por día con despacho">Prom. diario</th>
                <th class="num" title="Promedio diario del último mes vs. meses anteriores">Variación</th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.filas; track f.clienteId) {
                <tr [class.anomalia]="f.anomalia">
                  <td>
                    {{ f.cliente }}
                    <small class="sub">{{ nombreModalidad[f.modalidad] }}{{ f.repartidor ? ' · ' + f.repartidor : '' }}</small>
                  </td>
                  @for (kg of f.kgPorMes; track $index) {
                    <td class="num" [title]="f.diasPorMes[$index] + ' día(s) con despacho'">{{ kg ? (kg | number: '1.0-1') : '—' }}</td>
                  }
                  <td class="num"><strong>{{ f.totalKg | number: '1.0-1' }}</strong></td>
                  <td class="col-prom">
                    <div class="barra-cliente">
                      <span [style.width.%]="pct(f.promedioMensual, maxPromedio())"></span>
                      <b>{{ f.promedioMensual | number: '1.0-1' }} kg</b>
                    </div>
                  </td>
                  <td class="num">{{ f.promedioDiario | number: '1.0-1' }}</td>
                  <td class="num" [class.sube]="(f.variacion ?? 0) > 0" [class.baja]="(f.variacion ?? 0) < 0">
                    {{ f.variacion === null ? '—' : (f.variacion > 0 ? '▲ +' : f.variacion < 0 ? '▼ ' : '') + (f.variacion | number: '1.0-1') + ' %' }}
                  </td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="d.meses.length + 5" class="pp-texto-suave">No hay despachos en ese período.</td></tr>
              }
            </tbody>
            @if (d.filas.length > 0) {
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  @for (t of d.totalesPorMes; track $index) {
                    <td class="num"><strong>{{ t | number: '1.0-1' }}</strong></td>
                  }
                  <td class="num"><strong>{{ d.totalKg | number: '1.0-1' }}</strong></td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      } @else if (cargando()) {
        <p class="pp-texto-suave">Calculando…</p>
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
    .grafico {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      height: 150px;
      padding: 0.5rem 0.75rem 0;
      margin-bottom: 0.75rem;
      border-bottom: 2px solid var(--pp-borde);
    }
    .columna {
      flex: 1;
      max-width: 90px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      gap: 0.2rem;
    }
    .barra-mes {
      width: 70%;
      min-height: 2px;
      background: linear-gradient(var(--pp-celeste), var(--pp-celeste-oscuro));
      border-radius: 6px 6px 0 0;
    }
    .valor {
      font-size: 0.75rem;
      font-weight: 600;
    }
    .mes {
      font-size: 0.75rem;
      color: var(--pp-texto-suave);
      text-transform: capitalize;
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
    th {
      text-transform: capitalize;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .sub {
      display: block;
      font-size: 0.72rem;
      color: var(--pp-texto-suave);
    }
    .col-prom {
      min-width: 170px;
    }
    .barra-cliente {
      position: relative;
      height: 1.3rem;
      background: var(--pp-celeste-claro);
      border-radius: 4px;
      overflow: hidden;
    }
    .barra-cliente span {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--pp-celeste-medio);
    }
    .barra-cliente b {
      position: relative;
      padding-left: 0.4rem;
      font-size: 0.8rem;
      line-height: 1.3rem;
    }
    tr.anomalia td {
      background: #fff8ec;
    }
    .sube {
      color: var(--pp-exito);
      font-weight: 600;
    }
    .baja {
      color: var(--pp-error);
      font-weight: 600;
    }
    tfoot td {
      border-top: 2px solid var(--pp-borde);
    }
  `,
})
export class PromediosComponent {
  private readonly api = inject(DespachoService);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly modalidades = Object.keys(NOMBRE_MODALIDAD) as ModalidadCliente[];
  protected readonly repartidores = signal<Repartidor[]>([]);
  protected readonly hastaMes = signal(hoyISO().slice(0, 7));
  protected readonly desdeMes = signal(sumarMeses(hoyISO().slice(0, 7), -5));
  private filtroExtra: { repartidorId?: number; modalidad?: ModalidadCliente } = {};

  protected readonly datos = signal<PromedioMensual | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxMes = computed(() => Math.max(0, ...(this.datos()?.totalesPorMes ?? [])));
  protected readonly maxPromedio = computed(() => Math.max(0, ...(this.datos()?.filas ?? []).map((f) => f.promedioMensual)));

  constructor() {
    this.api.repartidores(true).subscribe({ next: (r) => this.repartidores.set(r) });
    this.cargar();
  }

  protected etiquetaMes(mes: string): string {
    const [a, m] = mes.split('-');
    return `${NOMBRE_MES[Number(m) - 1]} ${a.slice(2)}`;
  }

  protected pct(valor: number, max: number): number {
    return max > 0 ? Math.round((valor / max) * 100) : 0;
  }

  buscar(desde: string, hasta: string, repartidorId: string, modalidad: string): void {
    if (!desde || !hasta) {
      this.error.set('Indique los meses desde y hasta.');
      return;
    }
    this.desdeMes.set(desde);
    this.hastaMes.set(hasta);
    this.filtroExtra = {
      repartidorId: repartidorId ? Number(repartidorId) : undefined,
      modalidad: (modalidad || undefined) as ModalidadCliente | undefined,
    };
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.datos.set(null);
    this.api.promedioMensual({ desde: this.desdeMes(), hasta: this.hastaMes(), ...this.filtroExtra }).subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo calcular el reporte.'));
        this.cargando.set(false);
      },
    });
  }

  exportar(): void {
    const d = this.datos();
    if (!d) return;
    descargarCsv(`promedio-mensual-${d.meses[0]}-a-${d.meses[d.meses.length - 1]}.csv`, [
      ['Cliente', 'Modalidad', 'Repartidor', ...d.meses.map((m) => `Kg ${m}`), 'Total kg', 'Días con despacho', 'Promedio mensual kg', 'Promedio diario kg', 'Variación %'],
      ...d.filas.map((f) => [
        f.cliente,
        this.nombreModalidad[f.modalidad],
        f.repartidor ?? '',
        ...f.kgPorMes,
        f.totalKg,
        f.totalDias,
        f.promedioMensual,
        f.promedioDiario,
        f.variacion,
      ]),
    ]);
  }
}
