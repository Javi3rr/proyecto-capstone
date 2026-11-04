import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { mensajeError } from '../../core/errores';
import { EstadoEmisionDte, FilaFacturacion, NOMBRE_MODALIDAD, ResumenFacturacion } from '../../core/models';
import { DespachoService, hoyISO } from './despacho.service';

/** Mes 'AAAA-MM' desplazado n meses */
function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** [DESPACHO] Facturación mensual: una factura con IVA por cliente a partir de las guías del mes */
@Component({
  selector: 'app-facturacion',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Facturación mensual</h1>
      <p class="pp-texto-suave">
        A fin de mes cada cliente recibe una factura electrónica (DTE 33) por todas sus guías vigentes del mes, con el IVA desglosado.
      </p>
    </header>

    @if (sii(); as e) {
      <div class="sii" [attr.data-modo]="e.modo">
        <span class="sii__chip">SII · {{ e.ambiente }}</span>
        @if (e.modo !== 'produccion') {
          <span class="pp-texto-suave">Los folios de este modo no tienen validez tributaria.</span>
        } @else {
          <span>Emisor: {{ e.emisor.razonSocial }} · {{ e.emisor.rut }}</span>
        }
        @for (p of e.problemas; track p) {
          <span class="sii__problema">{{ p }}</span>
        }
      </div>
    }

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); ver(mesInput.value)">
        <div class="pp-campo">
          <label for="f-mes">Mes</label>
          <input id="f-mes" #mesInput type="month" [value]="mes()" required />
        </div>
        <button type="submit" class="pp-btn">Ver</button>
        <button
          type="button"
          class="pp-btn pp-btn--secundario"
          [disabled]="trabajando() || !porGenerar()"
          (click)="generarTodas()"
          title="Genera la factura de cada cliente que tiene guías del mes sin facturar"
        >
          Generar facturas pendientes ({{ porGenerar() }})
        </button>
        <button
          type="button"
          class="pp-btn pp-btn--secundario"
          [disabled]="trabajando() || !porEmitir() || !sii()?.listo"
          (click)="emitirMes()"
          title="Emite en el SII las facturas generadas del mes que aún no tienen folio"
        >
          {{ trabajando() ? 'Procesando…' : 'Emitir en SII las del mes (' + porEmitir() + ')' }}
        </button>
      </form>

      @if (datos(); as d) {
        @if (!d.mesCerrado) {
          <p class="mes-abierto">
            El mes aún no termina: las guías que se emitan después de generar una factura quedarán fuera de ella.
          </p>
        }
        <p class="pp-texto-suave nota">
          @if (d.preciosConIva) {
            El precio del kg incluye IVA: el precio neto de la factura es el precio ÷ 1,19 (con 2 decimales).
          } @else {
            El precio del kg es neto: la factura le suma el 19 % de IVA.
          }
          Se cobra lo despachado menos el descuento diario de cada cliente.
        </p>

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th class="num">Guías</th>
                <th class="num">Kg cobrados</th>
                <th class="num" title="Suma de los montos de las guías del mes">Cobrado en guías</th>
                <th class="num">Neto</th>
                <th class="num">IVA 19 %</th>
                <th class="num">Total</th>
                <th>Factura</th>
                <th>SII (factura electrónica)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (f of d.filas; track f.cliente.id) {
                <tr [class.pendiente]="!f.factura">
                  <td>
                    <button type="button" class="enlace nombre" (click)="alternar(f.cliente.id)" [attr.aria-expanded]="abierto() === f.cliente.id">
                      {{ abierto() === f.cliente.id ? '▾' : '▸' }} {{ f.cliente.nombre }}
                    </button>
                    <small class="sub">
                      {{ nombreModalidad[f.cliente.modalidad] }} ·
                      @if (f.cliente.rut) {
                        RUT {{ f.cliente.rut }}
                      } @else {
                        <span class="sin-rut" title="Sin RUT no se puede emitir la factura en producción">sin RUT</span>
                      }
                    </small>
                  </td>
                  <td class="num">
                    {{ f.guias }}
                    @if (f.guiasSinFolio) {
                      <small class="aviso" title="Guías vigentes que aún no se emiten en el SII">{{ f.guiasSinFolio }} sin folio SII</small>
                    }
                  </td>
                  <td class="num">{{ f.kg | number: '1.0-3' }}</td>
                  <td class="num">{{ f.montoGuias | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ f.neto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num">{{ f.iva | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  <td class="num"><strong>{{ f.total | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td>
                    @if (f.factura; as fa) {
                      <span class="pp-chip">N° {{ fa.id }}</span>
                      <small class="sub">{{ fa.fechaEmision | date: 'dd-MM-yyyy' : 'UTC' }}</small>
                      @if (f.guiasSinFacturar) {
                        <small class="aviso" title="Guías del mes registradas después de generar la factura. Anule la factura y genérela de nuevo para incluirlas.">
                          {{ f.guiasSinFacturar }} guía(s) sin facturar
                        </small>
                      }
                    } @else {
                      <span class="pp-chip pendiente-chip">Por generar</span>
                    }
                    @for (an of f.facturasAnuladas; track an.id) {
                      <small class="sub" [title]="an.motivoAnulacion ?? ''">
                        Anulada N° {{ an.id }}
                        @if (an.notaCredito?.dteEstado === 'EMITIDA') {
                          · NC folio {{ an.notaCredito!.dteFolio }}
                          @if (an.notaCredito!.dtePdfPath) {
                            <button type="button" class="enlace" [disabled]="trabajando()" (click)="verPdfNotaCredito(an.id)">PDF</button>
                          }
                        }
                      </small>
                    }
                  </td>
                  <td class="sii-celda">
                    @if (f.factura; as fa) {
                      @if (fa.dteEstado === 'EMITIDA') {
                        <span class="pp-chip ok-chip" [title]="'Ambiente: ' + (fa.dteAmbiente ?? '')">Folio {{ fa.dteFolio }}</span>
                        @if (fa.dtePdfPath) {
                          <button type="button" class="enlace" [disabled]="trabajando()" (click)="verPdf(fa.id)">PDF</button>
                        }
                        @if (fa.dteError) {
                          <small class="aviso" [title]="fa.dteError">⚠ {{ fa.dteError }}</small>
                        }
                        @if (fa.notaCredito?.dteEstado === 'RECHAZADA') {
                          <span class="pp-chip anulada-chip">Nota de crédito rechazada</span>
                          <small class="motivo" [title]="fa.notaCredito!.dteError ?? ''">{{ fa.notaCredito!.dteError }}</small>
                        }
                      } @else {
                        @if (fa.dteEstado === 'RECHAZADA') {
                          <span class="pp-chip anulada-chip" [title]="fa.dteError ?? ''">Rechazada</span>
                        }
                        <button
                          type="button"
                          class="pp-btn pp-btn--chico"
                          [disabled]="trabajando() || !sii()?.listo"
                          (click)="emitir(f)"
                        >
                          {{ fa.dteEstado === 'RECHAZADA' ? 'Reintentar' : 'Emitir en SII' }}
                        </button>
                        @if (fa.dteEstado === 'RECHAZADA' && fa.dteError) {
                          <small class="motivo" [title]="fa.dteError">{{ fa.dteError }}</small>
                        }
                      }
                    } @else {
                      <span class="pp-texto-suave">—</span>
                    }
                  </td>
                  <td class="botones">
                    @if (f.factura; as fa) {
                      <button
                        type="button"
                        class="pp-btn pp-btn--peligro pp-btn--chico"
                        [disabled]="trabajando() || (fa.dteEstado === 'EMITIDA' && !sii()?.listo)"
                        [title]="fa.dteEstado === 'EMITIDA' ? 'Emite en el SII una nota de crédito que anula la factura' : ''"
                        (click)="anular(f)"
                      >
                        {{ fa.notaCredito?.dteEstado === 'RECHAZADA' ? 'Reintentar anulación' : 'Anular' }}
                      </button>
                    } @else {
                      <button type="button" class="pp-btn pp-btn--chico" [disabled]="trabajando() || !f.guiasSinFacturar" (click)="generar(f)">
                        Generar
                      </button>
                    }
                  </td>
                </tr>
                @if (abierto() === f.cliente.id) {
                  <tr class="detalle">
                    <td colspan="10">
                      <table class="lineas">
                        <thead>
                          <tr>
                            <th>Detalle de la factura</th>
                            <th class="num">Guías</th>
                            <th class="num">Kg</th>
                            <th class="num">Precio kg{{ d.preciosConIva ? ' (con IVA)' : '' }}</th>
                            <th class="num">Precio neto</th>
                            <th class="num">Neto</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (l of f.lineas; track l.precioKg) {
                            <tr>
                              <td>PAN (KG)</td>
                              <td class="num">{{ l.guias }}</td>
                              <td class="num">{{ l.kg | number: '1.0-3' }}</td>
                              <td class="num">{{ l.precioKg | currency: 'CLP' : 'symbol-narrow' : '1.0-2' }}</td>
                              <td class="num">{{ l.precioNeto | currency: 'CLP' : 'symbol-narrow' : '1.2-2' }}</td>
                              <td class="num">{{ l.neto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                            </tr>
                          } @empty {
                            <tr><td colspan="6" class="pp-texto-suave">Sin guías por facturar.</td></tr>
                          }
                        </tbody>
                      </table>
                      @if (f.total - f.montoGuias; as dif) {
                        <p class="pp-texto-suave nota">
                          Diferencia con lo cobrado en las guías: {{ dif | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                          (redondeo del precio neto a 2 decimales).
                        </p>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="10" class="pp-texto-suave">{{ cargando() ? 'Calculando…' : 'No hay guías vigentes en ese mes.' }}</td></tr>
              }
            </tbody>
            @if (d.filas.length) {
              <tfoot>
                <tr>
                  <td><strong>Total ({{ d.totales.facturasGeneradas }} de {{ d.totales.clientes }} generadas)</strong></td>
                  <td></td>
                  <td class="num"><strong>{{ d.totales.kg | number: '1.0-3' }}</strong></td>
                  <td class="num"><strong>{{ d.totales.montoGuias | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td class="num"><strong>{{ d.totales.neto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td class="num"><strong>{{ d.totales.iva | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td class="num"><strong>{{ d.totales.total | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
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
      gap: 1rem;
      align-items: flex-end;
    }
    .filtros .pp-campo {
      min-width: 160px;
    }
    .filtros .pp-btn {
      margin-bottom: 1rem;
    }
    .mes-abierto {
      margin: 0 0 0.8rem;
      padding: 0.55rem 0.8rem;
      border-radius: 8px;
      background: #fff4e0;
      color: var(--pp-alerta);
      font-weight: 600;
      font-size: 0.86rem;
    }
    .nota {
      margin: 0 0 0.8rem;
      font-size: 0.85rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
    }
    .botones {
      white-space: nowrap;
      text-align: right;
    }
    .sub {
      display: block;
      font-size: 0.75rem;
      color: var(--pp-texto-suave);
    }
    .sin-rut {
      color: var(--pp-error);
      font-weight: 600;
    }
    .nombre {
      margin: 0;
      color: inherit;
      text-decoration: none;
      font-weight: 600;
      text-align: left;
    }
    tr.pendiente td {
      background: var(--pp-celeste-claro);
    }
    tr.detalle > td {
      background: #fafafa;
      padding: 0.6rem 1rem 0.8rem 2rem;
    }
    .lineas {
      width: auto;
      min-width: 32rem;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .lineas th,
    .lineas td {
      padding: 0.25rem 0.8rem;
    }
    .sii {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.9rem;
      margin-bottom: 1rem;
      padding: 0.55rem 0.8rem;
      border-radius: 8px;
      background: var(--pp-celeste-claro);
      font-size: 0.86rem;
    }
    .sii[data-modo='produccion'] {
      background: #e3f6ea;
    }
    .sii__chip {
      font-weight: 700;
      color: var(--pp-celeste-oscuro);
    }
    .sii__problema {
      color: var(--pp-error);
      font-weight: 600;
    }
    .sii-celda {
      white-space: nowrap;
    }
    .ok-chip {
      background: #e3f6ea;
      color: var(--pp-exito);
    }
    .pendiente-chip {
      background: #fff4e0;
      color: var(--pp-alerta);
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
    .enlace {
      margin-left: 0.35rem;
      border: none;
      background: none;
      color: var(--pp-celeste-oscuro);
      font: 600 0.85rem var(--pp-fuente);
      text-decoration: underline;
      cursor: pointer;
    }
    .motivo {
      display: block;
      max-width: 22rem;
      margin-top: 0.2rem;
      white-space: normal;
      font-size: 0.72rem;
      color: var(--pp-error);
    }
    .aviso {
      display: block;
      max-width: 18rem;
      white-space: normal;
      color: var(--pp-alerta);
      font-size: 0.72rem;
    }
  `,
})
export class FacturacionComponent {
  private readonly api = inject(DespachoService);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  /** Por defecto el mes anterior: es el que se factura a comienzos de mes */
  protected readonly mes = signal(sumarMeses(hoyISO().slice(0, 7), -1));
  protected readonly datos = signal<ResumenFacturacion | null>(null);
  protected readonly abierto = signal<number | null>(null);
  protected readonly cargando = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly sii = signal<EstadoEmisionDte | null>(null);

  constructor() {
    this.api.estadoDte().subscribe({ next: (e) => this.sii.set(e) });
    this.cargar();
  }

  protected porGenerar(): number {
    return this.datos()?.filas.filter((f) => !f.factura && f.guiasSinFacturar > 0).length ?? 0;
  }

  protected porEmitir(): number {
    return this.datos()?.filas.filter((f) => f.factura && f.factura.dteEstado !== 'EMITIDA').length ?? 0;
  }

  ver(mes: string): void {
    if (!mes) return;
    this.mes.set(mes);
    this.mensaje.set(null);
    this.cargar();
  }

  alternar(clienteId: number): void {
    this.abierto.set(this.abierto() === clienteId ? null : clienteId);
  }

  /** limpiarAvisos = false después de una acción, para no borrar su resultado */
  cargar(limpiarAvisos = true): void {
    this.cargando.set(true);
    if (limpiarAvisos) this.error.set(null);
    this.api.facturacion(this.mes()).subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo calcular la facturación del mes.'));
        this.cargando.set(false);
      },
    });
  }

  generar(f: FilaFacturacion): void {
    this.ejecutar(this.api.generarFacturas(this.mes(), f.cliente.id), (r) => {
      this.mensaje.set(`Factura N° ${r.creadas[0]} generada para ${f.cliente.nombre}.`);
    });
  }

  generarTodas(): void {
    if (!confirm(`Se generará la factura de ${this.porGenerar()} cliente(s) con las guías vigentes del mes. ¿Continuar?`)) return;
    this.ejecutar(this.api.generarFacturas(this.mes()), (r) => {
      this.mensaje.set(`Facturas generadas: ${r.creadas.length}.`);
      if (r.errores.length) {
        const nombre = (id: number) => this.datos()?.filas.find((f) => f.cliente.id === id)?.cliente.nombre ?? `cliente ${id}`;
        this.error.set('Con problemas: ' + r.errores.map((x) => `${nombre(x.clienteId)}: ${x.mensaje}`).join(' · '));
      }
    });
  }

  emitir(f: FilaFacturacion): void {
    const id = f.factura!.id;
    this.ejecutar(this.api.emitirFactura(id), (r) => {
      this.mensaje.set(`Factura N° ${id} (${f.cliente.nombre}) emitida en el SII con folio ${r.dteFolio}.`);
    });
  }

  emitirMes(): void {
    if (!confirm(`Se emitirán en el SII ${this.porEmitir()} factura(s) del mes. ¿Continuar?`)) return;
    this.ejecutar(this.api.emitirFacturasMes(this.mes()), (r) => {
      this.mensaje.set(`Emitidas en el SII: ${r.emitidas.length} de ${r.total}.`);
      if (r.errores.length) {
        this.error.set('Con problemas: ' + r.errores.map((x) => `N° ${x.facturaId}: ${x.mensaje}`).join(' · '));
      }
    });
  }

  anular(f: FilaFacturacion): void {
    const fa = f.factura!;
    const avisoSii =
      fa.dteEstado === 'EMITIDA'
        ? `\n\nTiene la factura electrónica folio ${fa.dteFolio}: se emitirá en el SII una nota de crédito que la anula.` +
          ' Si el SII la rechaza, la factura sigue vigente.'
        : '';
    const motivo = prompt(
      `Anular factura N° ${fa.id} (${f.cliente.nombre}). Sus guías quedan libres para facturarlas de nuevo.${avisoSii}\n` +
        'Indique el motivo (va en la nota de crédito y en la auditoría):',
      fa.notaCredito?.motivo ?? '',
    );
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      this.error.set('Debe indicar un motivo de al menos 5 caracteres.');
      return;
    }
    this.ejecutar(this.api.anularFactura(fa.id, motivo.trim()), (r) => {
      const nc = r.notaCredito?.dteEstado === 'EMITIDA' ? ` con la nota de crédito folio ${r.notaCredito.dteFolio}` : '';
      this.mensaje.set(`Factura N° ${fa.id} anulada${nc}. Puede generarla de nuevo.`);
    });
  }

  verPdfNotaCredito(facturaId: number): void {
    this.abrirPdf(this.api.pdfNotaCredito(facturaId));
  }

  /** Abre el PDF oficial (con timbre electrónico) que entregó el proveedor */
  verPdf(id: number): void {
    this.abrirPdf(this.api.pdfFactura(id));
  }

  private abrirPdf(descarga: Observable<Blob>): void {
    this.trabajando.set(true);
    descarga.subscribe({
      next: (blob) => {
        this.trabajando.set(false);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e, 'No se pudo abrir el PDF.'));
      },
    });
  }

  /** Ejecuta una acción, muestra el resultado y recarga el mes */
  private ejecutar<T>(accion: Observable<T>, alTerminar: (r: T) => void): void {
    this.trabajando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    accion.subscribe({
      next: (r) => {
        this.trabajando.set(false);
        alTerminar(r);
        this.cargar(false);
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
        this.cargar(false);
      },
    });
  }
}
