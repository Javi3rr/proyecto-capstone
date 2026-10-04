import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/errores';
import { FilaPlanilla, LineaDespacho, ModalidadCliente, Planilla } from '../../core/models';
import { DespachoService, abrirImpresionGuias, hoyISO, sumarDias } from './despacho.service';

interface Grupo {
  clave: string;
  titulo: string;
  nota: string;
  filtroLote: { modalidad?: ModalidadCliente; repartidorId?: number };
  filas: FilaPlanilla[];
}

/** [DESPACHO] Planilla diaria: total de kg por cliente (reemplaza el cuaderno) */
@Component({
  selector: 'app-planilla',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <div>
        <h1>Planilla del día</h1>
        <p class="pp-texto-suave">
          Anote el total de kg de cada cliente y presione Enter. El monto se calcula solo.
        </p>
      </div>
      <div class="fecha">
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(-1)" aria-label="Día anterior">◀</button>
        <input type="date" [value]="fecha()" (change)="irA($any($event.target).value)" aria-label="Fecha de la planilla" />
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(1)" aria-label="Día siguiente">▶</button>
        @if (cerrada()) {
          <span class="estado estado--cerrado">Día cerrado</span>
        } @else {
          <span class="estado">Día abierto</span>
        }
      </div>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="pp-texto-suave">Cargando planilla…</p>
    } @else {
      @if (planilla(); as p) {
      @if (p.precioGeneral === null) {
        <p class="pp-alerta-error">No hay precio del kg definido para esta fecha. Regístrelo en la pestaña "Precio del kg".</p>
      }

      @for (g of grupos(); track g.clave) {
        <section class="pp-card grupo">
          <div class="grupo__cabecera">
            <div>
              <h2>{{ g.titulo }}</h2>
              <p class="pp-texto-suave">{{ g.nota }}</p>
            </div>
            <button
              type="button"
              class="pp-btn pp-btn--chico"
              [disabled]="totalGrupo(g).lineas === 0"
              (click)="emitirGrupo(g)"
            >
              Emitir e imprimir guías
            </button>
          </div>

          <div class="tabla-scroll">
            <table class="pp-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th class="num">Precio kg</th>
                  <th class="num">Desc.</th>
                  <th class="kg">Kg</th>
                  <th class="num">Monto</th>
                  <th>Guía</th>
                </tr>
              </thead>
              <tbody>
                @for (f of g.filas; track f.cliente.id) {
                  <tr [class.con-dato]="f.despacho && num(f.despacho.kg) > 0">
                    <td>
                      <strong>{{ f.cliente.nombre }}</strong>
                      @if (!f.cliente.activo) {
                        <span class="pp-chip">desactivado</span>
                      }
                    </td>
                    <td class="num">
                      {{ precioFila(f) === null ? '—' : (precioFila(f)! | currency: 'CLP' : 'symbol-narrow' : '1.0-0') }}
                    </td>
                    <td class="num">{{ num(f.cliente.kgDescuentoDiario) > 0 ? (num(f.cliente.kgDescuentoDiario) | number: '1.0-3') + ' kg' : '' }}</td>
                    <td class="kg">
                      <input
                        #kg
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.5"
                        [value]="f.despacho ? num(f.despacho.kg) : ''"
                        [disabled]="!editable(f)"
                        [attr.aria-label]="'Kg de ' + f.cliente.nombre"
                        (keydown.enter)="kg.blur()"
                        (change)="guardar(f, kg)"
                      />
                      @if (guardando().has(f.cliente.id)) {
                        <span class="pp-texto-suave estado-fila">guardando…</span>
                      }
                    </td>
                    <td class="num">
                      {{ f.despacho ? (num(f.despacho.monto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : '' }}
                    </td>
                    <td class="guia">
                      @if (f.guia) {
                        <span class="pp-chip">N° {{ f.guia.id }}</span>
                        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="imprimir(f.guia.id)">
                          {{ f.guia.impresiones > 0 ? 'Reimprimir' : 'Imprimir' }}
                        </button>
                      } @else if (f.despacho && num(f.despacho.kg) > 0) {
                        <button type="button" class="pp-btn pp-btn--chico" (click)="emitir(f)">Emitir guía</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">{{ totalGrupo(g).lineas }} cliente(s) con pan</td>
                  <td class="kg"><strong>{{ totalGrupo(g).kg | number: '1.0-3' }} kg</strong></td>
                  <td class="num"><strong>{{ totalGrupo(g).monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      }

      <section class="pp-card resumen">
        <div>
          <strong>Total del día:</strong> {{ totalDia().kg | number: '1.0-3' }} kg ·
          {{ totalDia().monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
          @if (totalDia().sinGuia > 0) {
            · <span class="alerta">{{ totalDia().sinGuia }} cliente(s) sin guía</span>
          }
        </div>
        @if (!cerrada()) {
          <button type="button" class="pp-btn" (click)="cerrarDia()">Cerrar día</button>
        } @else if (esAdmin()) {
          <button type="button" class="pp-btn pp-btn--secundario" (click)="reabrirDia()">Reabrir día (admin)</button>
        }
      </section>
      }
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
    .estado {
      padding: 0.25rem 0.7rem;
      border-radius: 999px;
      background: #e7f6ed;
      color: var(--pp-exito);
      font-weight: 600;
      font-size: 0.8rem;
    }
    .estado--cerrado {
      background: #fdf0e1;
      color: var(--pp-alerta);
    }
    .grupo {
      margin-bottom: 1rem;
    }
    .grupo__cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .grupo__cabecera h2 {
      font-size: 1.1rem;
      color: var(--pp-celeste-oscuro);
      margin: 0;
    }
    .grupo__cabecera p {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .kg {
      width: 150px;
      white-space: nowrap;
    }
    .kg input {
      width: 100px;
      min-height: 38px;
      padding: 0.3rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 600 1rem var(--pp-fuente);
      text-align: right;
    }
    .kg input:focus {
      outline: 3px solid var(--pp-celeste-medio);
      border-color: var(--pp-celeste);
    }
    .kg input:disabled {
      background: var(--pp-fondo);
    }
    .estado-fila {
      font-size: 0.75rem;
      margin-left: 0.3rem;
    }
    tr.con-dato td {
      background: #f4fbff;
    }
    .guia {
      white-space: nowrap;
    }
    .guia .pp-chip {
      margin-right: 0.35rem;
    }
    tfoot td {
      border-top: 2px solid var(--pp-borde);
    }
    .resumen {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .alerta {
      color: var(--pp-alerta);
      font-weight: 600;
    }
  `,
})
export class PlanillaComponent {
  private readonly api = inject(DespachoService);
  private readonly auth = inject(AuthService);

  protected readonly fecha = signal(hoyISO());
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal<Set<number>>(new Set());
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly cerrada = computed(() => this.planilla()?.jornada.cerrada ?? false);
  protected readonly esAdmin = computed(() => this.auth.usuario()?.rol === 'ADMIN');

  /** Grupos en el mismo orden del cuaderno */
  protected readonly grupos = computed<Grupo[]>(() => {
    const filas = this.planilla()?.filas ?? [];
    const grupos: Grupo[] = [];

    const pds = filas.filter((f) => f.cliente.modalidad === 'PAGO_DIA_SIGUIENTE');
    if (pds.length) {
      grupos.push({
        clave: 'pds',
        titulo: 'Pago día siguiente',
        nota: 'Llevan hoy y se cobran mañana con su repartidor.',
        filtroLote: { modalidad: 'PAGO_DIA_SIGUIENTE' },
        filas: pds,
      });
    }

    const porRepartidor = new Map<number, FilaPlanilla[]>();
    for (const f of filas.filter((x) => x.cliente.modalidad === 'REPARTO')) {
      const id = f.cliente.repartidor?.id ?? 0;
      porRepartidor.set(id, [...(porRepartidor.get(id) ?? []), f]);
    }
    const repartos = [...porRepartidor.entries()].sort(([, a], [, b]) =>
      (a[0].cliente.repartidor?.nombre ?? '').localeCompare(b[0].cliente.repartidor?.nombre ?? ''),
    );
    for (const [id, fs] of repartos) {
      grupos.push({
        clave: `r${id}`,
        titulo: fs[0].cliente.repartidor?.nombre ?? 'Sin repartidor',
        nota: 'Reparto y cobro del día.',
        filtroLote: { modalidad: 'REPARTO', repartidorId: id || undefined },
        filas: fs,
      });
    }

    const presenciales = filas.filter((f) => f.cliente.modalidad === 'PRESENCIAL');
    if (presenciales.length) {
      grupos.push({
        clave: 'pres',
        titulo: 'Presenciales',
        nota: 'Retiran en la panadería; los atiende el despachador.',
        filtroLote: { modalidad: 'PRESENCIAL' },
        filas: presenciales,
      });
    }
    return grupos;
  });

  protected readonly totalDia = computed(() => {
    const filas = (this.planilla()?.filas ?? []).filter((f) => f.despacho && this.num(f.despacho.kg) > 0);
    return {
      kg: filas.reduce((t, f) => t + this.num(f.despacho?.kg), 0),
      monto: filas.reduce((t, f) => t + this.num(f.despacho?.monto), 0),
      sinGuia: filas.filter((f) => !f.guia).length,
    };
  });

  constructor() {
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined || v === '' ? 0 : Number(v);
  }

  /** Precio de la línea guardada, o el que se aplicaría hoy */
  protected precioFila(f: FilaPlanilla): number | null {
    if (f.despacho) return this.num(f.despacho.precioKg);
    return f.precioKgAplicable === null ? null : this.num(f.precioKgAplicable);
  }

  /** No se edita si el día está cerrado (salvo admin) o si ya tiene guía emitida */
  protected editable(f: FilaPlanilla): boolean {
    return (!this.cerrada() || this.esAdmin()) && !f.guia;
  }

  protected totalGrupo(g: Grupo) {
    const con = g.filas.filter((f) => f.despacho && this.num(f.despacho.kg) > 0);
    return {
      lineas: con.length,
      kg: con.reduce((t, f) => t + this.num(f.despacho?.kg), 0),
      monto: con.reduce((t, f) => t + this.num(f.despacho?.monto), 0),
    };
  }

  cambiarDia(dias: number): void {
    this.irA(sumarDias(this.fecha(), dias));
  }

  irA(fecha: string): void {
    if (!fecha) return;
    this.fecha.set(fecha);
    this.limpiarAvisos();
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.planilla(this.fecha()).subscribe({
      next: (p) => {
        this.planilla.set(p);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo cargar la planilla.'));
        this.cargando.set(false);
      },
    });
  }

  guardar(f: FilaPlanilla, input: HTMLInputElement): void {
    const anterior = f.despacho ? String(this.num(f.despacho.kg)) : '';
    const kg = input.value === '' ? 0 : Number(input.value.replace(',', '.'));
    if (Number.isNaN(kg) || kg < 0) {
      this.error.set(`Kg inválidos para ${f.cliente.nombre}`);
      input.value = anterior;
      return;
    }
    if (kg === this.num(f.despacho?.kg)) return; // sin cambios

    this.limpiarAvisos();
    this.marcarGuardando(f.cliente.id, true);
    this.api.registrarLinea(this.fecha(), f.cliente.id, kg).subscribe({
      next: (r) => {
        this.marcarGuardando(f.cliente.id, false);
        const despacho = 'eliminado' in r ? null : (r as LineaDespacho);
        this.actualizarFila(f.cliente.id, { despacho });
      },
      error: (e) => {
        this.marcarGuardando(f.cliente.id, false);
        this.error.set(`${f.cliente.nombre}: ${mensajeError(e)}`);
        input.value = anterior; // vuelve al valor guardado
      },
    });
  }

  emitir(f: FilaPlanilla): void {
    if (!f.despacho) return;
    this.limpiarAvisos();
    this.api.emitirGuia(f.despacho.id).subscribe({
      next: (g) => {
        this.actualizarFila(f.cliente.id, { guia: { id: g.id, impresiones: 0 } });
        abrirImpresionGuias([g.id]);
        this.marcarImpresas([g.id]);
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  emitirGrupo(g: Grupo): void {
    this.limpiarAvisos();
    this.api.emitirLote(this.fecha(), g.filtroLote).subscribe({
      next: (r) => {
        this.mensaje.set(`${g.titulo}: ${r.creadas.length} guía(s) nueva(s), ${r.ids.length} para imprimir.`);
        abrirImpresionGuias(r.ids);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  imprimir(id: number): void {
    abrirImpresionGuias([id]);
    this.marcarImpresas([id]);
  }

  cerrarDia(): void {
    const sinGuia = this.totalDia().sinGuia;
    const aviso = sinGuia > 0 ? `\n\nAtención: ${sinGuia} cliente(s) aún no tienen guía emitida.` : '';
    if (!confirm(`¿Cerrar la planilla del ${this.fecha()}? Ya no se podrán modificar los kg.${aviso}`)) return;
    this.api.cerrarDia(this.fecha()).subscribe({
      next: () => {
        this.mensaje.set('Día cerrado.');
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  reabrirDia(): void {
    if (!confirm('¿Reabrir este día para corregirlo? Quedará registrado en la auditoría.')) return;
    this.api.reabrirDia(this.fecha()).subscribe({
      next: () => {
        this.mensaje.set('Día reabierto.');
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private actualizarFila(clienteId: number, cambios: Partial<FilaPlanilla>): void {
    const p = this.planilla();
    if (!p) return;
    this.planilla.set({
      ...p,
      filas: p.filas.map((f) => (f.cliente.id === clienteId ? { ...f, ...cambios } : f)),
    });
  }

  /** La pestaña de impresión registra la impresión; aquí solo se refleja el botón "Reimprimir" */
  private marcarImpresas(ids: number[]): void {
    const p = this.planilla();
    if (!p) return;
    this.planilla.set({
      ...p,
      filas: p.filas.map((f) =>
        f.guia && ids.includes(f.guia.id) ? { ...f, guia: { ...f.guia, impresiones: f.guia.impresiones + 1 } } : f,
      ),
    });
  }

  private marcarGuardando(id: number, activo: boolean): void {
    const s = new Set(this.guardando());
    if (activo) s.add(id);
    else s.delete(id);
    this.guardando.set(s);
  }

  private limpiarAvisos(): void {
    this.error.set(null);
    this.mensaje.set(null);
  }
}
