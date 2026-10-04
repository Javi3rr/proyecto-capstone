import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/errores';
import {
  FilaPlanilla,
  LineaDespacho,
  ModalidadCliente,
  NOMBRE_VUELTA,
  Planilla,
  VUELTAS,
  Vuelta,
  VueltaPlanilla,
} from '../../core/models';
import { DespachoService, abrirImpresionGuias, hoyISO, sumarDias } from './despacho.service';

interface Grupo {
  clave: string;
  titulo: string;
  nota: string;
  filtroLote: { modalidad?: ModalidadCliente; repartidorId?: number };
  filas: FilaPlanilla[];
}

/**
 * [DESPACHO] Planilla diaria, igual que el cuaderno:
 * una fila por cliente y 3 columnas de vueltas (mañana, tarde 1, tarde 2).
 */
@Component({
  selector: 'app-planilla',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <div class="titulo">
        <h1>Planilla del día</h1>
        <div class="fecha">
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(-1)" aria-label="Día anterior">◀</button>
          <input type="date" [value]="fecha()" (change)="irA($any($event.target).value)" aria-label="Fecha de la planilla" />
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cambiarDia(1)" aria-label="Día siguiente">▶</button>
          <span class="estado" [class.estado--cerrado]="cerrada()">{{ cerrada() ? 'Día cerrado' : 'Día abierto' }}</span>
        </div>
      </div>
      <div class="resumen-dia">
        <span><strong>{{ totalDia().kg | number: '1.0-3' }}</strong> kg</span>
        <span><strong>{{ totalDia().monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        @if (totalDia().sinGuia > 0) {
          <span class="alerta">{{ totalDia().sinGuia }} sin guía</span>
        }
        @if (!cerrada()) {
          <button type="button" class="pp-btn pp-btn--chico" (click)="cerrarDia()">Cerrar día</button>
        } @else if (esAdmin()) {
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="reabrirDia()">Reabrir (admin)</button>
        }
      </div>
    </header>

    <p class="ayuda pp-texto-suave">
      Escriba los kg en la vuelta que corresponda y presione Enter para pasar al siguiente cliente.
      "Guía" emite e imprime la guía de esa entrega; "Guías" en el encabezado lo hace para toda la columna.
    </p>

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

        <div class="grupos">
          @for (g of grupos(); track g.clave) {
            <details class="pp-card grupo" open>
              <summary>
                <span class="grupo__titulo">{{ g.titulo }}</span>
                <span class="grupo__totales">
                  {{ totalGrupo(g).kg | number: '1.0-3' }} kg ·
                  {{ totalGrupo(g).monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                </span>
              </summary>
              <p class="grupo__nota pp-texto-suave">{{ g.nota }}</p>

              <table class="planilla">
                <thead>
                  <tr>
                    <th class="col-cliente">Cliente</th>
                    @for (v of vueltas; track v) {
                      <th class="col-vuelta">
                        {{ nombreVuelta[v] }}
                        <button
                          type="button"
                          class="mini"
                          title="Emitir e imprimir las guías de esta vuelta"
                          [disabled]="!hayKgEnVuelta(g, v)"
                          (click)="emitirGrupo(g, v)"
                        >
                          Guías
                        </button>
                      </th>
                    }
                    <th class="col-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of g.filas; track f.cliente.id) {
                    <tr [class.con-dato]="kgFila(f) > 0">
                      <td class="col-cliente">
                        <span class="nombre">{{ f.cliente.nombre }}</span>
                        @if (f.cliente.precioKgEspecial !== null) {
                          <span class="etiqueta" title="Precio especial por kg">{{ num(f.cliente.precioKgEspecial) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</span>
                        }
                        @if (num(f.cliente.kgDescuentoDiario) > 0) {
                          <span class="etiqueta" title="Kg de descuento diario">-{{ num(f.cliente.kgDescuentoDiario) | number: '1.0-3' }} kg</span>
                        }
                        @if (!f.cliente.activo) {
                          <span class="etiqueta">desactivado</span>
                        }
                      </td>
                      @for (c of f.vueltas; track c.vuelta) {
                        <td class="col-vuelta">
                          <div class="celda">
                            <input
                              #kg
                              type="number"
                              inputmode="decimal"
                              min="0"
                              step="0.5"
                              [value]="c.despacho && num(c.despacho.kg) > 0 ? num(c.despacho.kg) : ''"
                              [disabled]="!editable(c)"
                              [class.guardando]="guardando().has(clave(f, c.vuelta))"
                              [attr.aria-label]="'Kg de ' + f.cliente.nombre + ', ' + nombreVuelta[c.vuelta]"
                              [attr.data-vuelta]="c.vuelta"
                              (keydown.enter)="siguiente(kg, c.vuelta)"
                              (change)="guardar(f, c, kg)"
                            />
                            @if (c.guia) {
                              <button type="button" class="mini mini--guia" [title]="'Reimprimir guía N° ' + c.guia.id" (click)="imprimir(c.guia.id)">
                                N°{{ c.guia.id }}
                              </button>
                            } @else if (c.despacho && num(c.despacho.kg) > 0) {
                              <button type="button" class="mini mini--emitir" title="Emitir e imprimir la guía" (click)="emitir(f, c)">Guía</button>
                            }
                          </div>
                        </td>
                      }
                      <td class="col-total">
                        @if (kgFila(f) > 0) {
                          <strong>{{ kgFila(f) | number: '1.0-3' }}</strong>
                          <span class="monto">{{ montoFila(f) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </details>
          }
        </div>
      }
    }
  `,
  styles: `
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .titulo {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .titulo h1 {
      margin: 0;
      font-size: 1.4rem;
    }
    .fecha {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .fecha input {
      min-height: 34px;
      padding: 0.2rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 600 0.95rem var(--pp-fuente);
    }
    .estado {
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      background: #e7f6ed;
      color: var(--pp-exito);
      font-weight: 600;
      font-size: 0.78rem;
    }
    .estado--cerrado {
      background: #fdf0e1;
      color: var(--pp-alerta);
    }
    .resumen-dia {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      font-size: 0.95rem;
    }
    .alerta {
      color: var(--pp-alerta);
      font-weight: 600;
    }
    .ayuda {
      font-size: 0.82rem;
      margin: 0.4rem 0 0.75rem;
    }
    /* 2 columnas sin huecos: cada sección se apila bajo la anterior de su columna */
    .grupos {
      columns: 2 520px;
      column-gap: 0.75rem;
    }
    .grupo {
      display: block;
      break-inside: avoid;
      margin: 0 0 0.75rem;
      padding: 0.6rem 0.75rem;
    }
    summary {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
      cursor: pointer;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary::before {
      content: '▾';
      color: var(--pp-celeste);
      margin-right: 0.3rem;
    }
    details:not([open]) summary::before {
      content: '▸';
    }
    .grupo__titulo {
      flex: 1;
      font-weight: 800;
      font-size: 1.02rem;
      color: var(--pp-celeste-oscuro);
    }
    .grupo__totales {
      font-size: 0.85rem;
      font-weight: 600;
    }
    .grupo__nota {
      font-size: 0.75rem;
      margin: 0.1rem 0 0.35rem;
    }
    /* Anchos fijos: Mañana / Tarde 1 / Tarde 2 quedan alineadas en todas las secciones */
    .planilla {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .planilla th {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--pp-texto-suave);
      background: var(--pp-celeste-claro);
      padding: 0.25rem 0.3rem;
      text-align: left;
      white-space: nowrap;
    }
    .planilla td {
      padding: 0.12rem 0.3rem;
      border-bottom: 1px solid var(--pp-borde);
      vertical-align: middle;
    }
    tr.con-dato td {
      background: #f4fbff;
    }
    .col-cliente {
      width: auto;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nombre {
      font-weight: 600;
    }
    .etiqueta {
      display: inline-block;
      margin-left: 0.25rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: var(--pp-celeste-claro);
      color: var(--pp-celeste-oscuro);
      font-size: 0.68rem;
      font-weight: 600;
    }
    .col-vuelta {
      width: 108px;
    }
    .celda {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }
    .celda input {
      width: 58px;
      height: 28px;
      padding: 0 0.3rem;
      border: 1px solid var(--pp-borde);
      border-radius: 5px;
      font: 600 0.9rem var(--pp-fuente);
      text-align: right;
    }
    .celda input:focus {
      outline: 2px solid var(--pp-celeste-medio);
      border-color: var(--pp-celeste);
    }
    .celda input:disabled {
      background: var(--pp-fondo);
      color: var(--pp-texto);
    }
    .celda input.guardando {
      border-color: var(--pp-alerta);
    }
    .mini {
      border: 1px solid var(--pp-celeste-medio);
      background: var(--pp-blanco);
      color: var(--pp-celeste-oscuro);
      border-radius: 4px;
      font: 600 0.66rem var(--pp-fuente);
      padding: 0.1rem 0.3rem;
      cursor: pointer;
      white-space: nowrap;
    }
    .mini:disabled {
      opacity: 0.4;
      cursor: default;
    }
    th .mini {
      margin-left: 0.2rem;
    }
    .mini--emitir {
      background: var(--pp-celeste);
      border-color: var(--pp-celeste);
      color: var(--pp-blanco);
    }
    .mini--guia {
      background: #e7f6ed;
      border-color: #bfe5cd;
      color: var(--pp-exito);
    }
    .col-total {
      width: 78px;
      text-align: right;
      white-space: nowrap;
    }
    .monto {
      display: block;
      font-size: 0.72rem;
      color: var(--pp-texto-suave);
    }
    @media (max-width: 1100px) {
      .grupos {
        columns: 1;
      }
    }
  `,
})
export class PlanillaComponent {
  private readonly api = inject(DespachoService);
  private readonly auth = inject(AuthService);

  protected readonly vueltas = VUELTAS;
  protected readonly nombreVuelta = NOMBRE_VUELTA;

  protected readonly fecha = signal(hoyISO());
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal<Set<string>>(new Set());
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
    const celdas = (this.planilla()?.filas ?? []).flatMap((f) => f.vueltas).filter((c) => this.kgCelda(c) > 0);
    return {
      kg: celdas.reduce((t, c) => t + this.kgCelda(c), 0),
      monto: celdas.reduce((t, c) => t + this.num(c.despacho?.monto), 0),
      sinGuia: celdas.filter((c) => !c.guia).length,
    };
  });

  constructor() {
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined || v === '' ? 0 : Number(v);
  }

  protected clave(f: FilaPlanilla, vuelta: Vuelta): string {
    return `${f.cliente.id}-${vuelta}`;
  }

  protected kgCelda(c: VueltaPlanilla): number {
    return this.num(c.despacho?.kg);
  }

  protected kgFila(f: FilaPlanilla): number {
    return f.vueltas.reduce((t, c) => t + this.kgCelda(c), 0);
  }

  protected montoFila(f: FilaPlanilla): number {
    return f.vueltas.reduce((t, c) => t + this.num(c.despacho?.monto), 0);
  }

  protected hayKgEnVuelta(g: Grupo, v: Vuelta): boolean {
    return g.filas.some((f) => this.kgCelda(f.vueltas[v - 1]) > 0);
  }

  /** No se edita si el día está cerrado (salvo admin) o si esa vuelta ya tiene guía emitida */
  protected editable(c: VueltaPlanilla): boolean {
    return (!this.cerrada() || this.esAdmin()) && !c.guia;
  }

  protected totalGrupo(g: Grupo) {
    return {
      kg: g.filas.reduce((t, f) => t + this.kgFila(f), 0),
      monto: g.filas.reduce((t, f) => t + this.montoFila(f), 0),
    };
  }

  cambiarDia(dias: number): void {
    this.irA(sumarDias(this.fecha(), dias));
  }

  irA(fecha: string): void {
    if (!fecha) return;
    this.fecha.set(fecha);
    this.limpiarAvisos();
    this.planilla.set(null);
    this.cargar();
  }

  /** Recarga la planilla (sin ocultar la tabla si ya está en pantalla) */
  cargar(): void {
    this.cargando.set(this.planilla() === null);
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

  /** Enter: guarda y pasa al cliente siguiente en la misma vuelta (como bajar por la columna del cuaderno) */
  siguiente(input: HTMLInputElement, vuelta: Vuelta): void {
    const columna = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[data-vuelta="${vuelta}"]:not(:disabled)`),
    );
    const i = columna.indexOf(input);
    input.blur();
    columna[i + 1]?.focus();
    columna[i + 1]?.select();
  }

  guardar(f: FilaPlanilla, c: VueltaPlanilla, input: HTMLInputElement): void {
    const anterior = this.kgCelda(c) > 0 ? String(this.kgCelda(c)) : '';
    const kg = input.value === '' ? 0 : Number(input.value.replace(',', '.'));
    if (Number.isNaN(kg) || kg < 0) {
      this.error.set(`Kg inválidos para ${f.cliente.nombre}`);
      input.value = anterior;
      return;
    }
    if (kg === this.kgCelda(c)) return; // sin cambios

    const clave = this.clave(f, c.vuelta);
    this.limpiarAvisos();
    this.marcarGuardando(clave, true);
    this.api.registrarLinea(this.fecha(), f.cliente.id, c.vuelta, kg).subscribe({
      next: () => {
        this.marcarGuardando(clave, false);
        // Se recarga para reflejar el monto y el descuento diario (puede moverse de vuelta)
        this.cargar();
      },
      error: (e) => {
        this.marcarGuardando(clave, false);
        this.error.set(`${f.cliente.nombre} (${NOMBRE_VUELTA[c.vuelta]}): ${mensajeError(e)}`);
        input.value = anterior;
      },
    });
  }

  emitir(f: FilaPlanilla, c: VueltaPlanilla): void {
    const despacho: LineaDespacho | null = c.despacho;
    if (!despacho) return;
    this.limpiarAvisos();
    this.api.emitirGuia(despacho.id).subscribe({
      next: (g) => {
        abrirImpresionGuias([g.id]);
        this.cargar();
      },
      error: (e) => this.error.set(`${f.cliente.nombre}: ${mensajeError(e)}`),
    });
  }

  emitirGrupo(g: Grupo, vuelta: Vuelta): void {
    this.limpiarAvisos();
    this.api.emitirLote(this.fecha(), { ...g.filtroLote, vuelta }).subscribe({
      next: (r) => {
        this.mensaje.set(
          `${g.titulo} · ${NOMBRE_VUELTA[vuelta]}: ${r.creadas.length} guía(s) nueva(s), ${r.ids.length} para imprimir.`,
        );
        abrirImpresionGuias(r.ids);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  imprimir(id: number): void {
    abrirImpresionGuias([id]);
  }

  cerrarDia(): void {
    const sinGuia = this.totalDia().sinGuia;
    const aviso = sinGuia > 0 ? `\n\nAtención: hay ${sinGuia} entrega(s) sin guía emitida.` : '';
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

  private marcarGuardando(clave: string, activo: boolean): void {
    const s = new Set(this.guardando());
    if (activo) s.add(clave);
    else s.delete(clave);
    this.guardando.set(s);
  }

  private limpiarAvisos(): void {
    this.error.set(null);
    this.mensaje.set(null);
  }
}
