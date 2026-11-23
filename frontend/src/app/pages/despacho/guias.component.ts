import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { mensajeError } from '../../core/errores';
import { Cliente, EstadoEmisionDte, Guia, NOMBRE_VUELTA } from '../../core/models';
import { DespachoService, abrirImpresionGuias, hoyISO } from './despacho.service';

/** [DESPACHO] Respaldo digital de guías: búsqueda, reimpresión (PDF) y anulación */
@Component({
  selector: 'app-guias',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Guías emitidas</h1>
      <p class="pp-texto-suave">
        Respaldo digital de cada guía. Al imprimir una vuelta, las guías se envían solas al SII (guía de despacho electrónica,
        DTE 52) antes de salir. "Emitir en SII" queda para reintentar las que no se pudieron enviar.
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
      <div class="filtros">
        <div class="pp-campo">
          <label for="f-fecha">Fecha</label>
          <input id="f-fecha" #fecha type="date" [value]="filtroFecha" />
        </div>
        <div class="pp-campo">
          <label for="f-numero">N° de guía</label>
          <input id="f-numero" #numero type="number" min="1" placeholder="Ej. 125" />
        </div>
        <div class="pp-campo">
          <label for="f-cliente">Cliente</label>
          <select id="f-cliente" #cliente>
            <option value="">Todos</option>
            @for (c of clientes(); track c.id) {
              <option [value]="c.id">{{ c.nombre }}</option>
            }
          </select>
        </div>
        <label class="check"><input type="checkbox" #anuladas /> Incluir anuladas</label>
        <button
          type="button"
          class="pp-btn"
          (click)="buscar(fecha.value, numero.value, cliente.value, anuladas.checked)"
        >
          Buscar
        </button>
        <button
          type="button"
          class="pp-btn pp-btn--secundario"
          [disabled]="trabajando() || !fecha.value || !sii()?.listo"
          (click)="emitirDia(fecha.value)"
          title="Emite en el SII todas las guías vigentes de esa fecha que aún no tienen folio"
        >
          {{ trabajando() ? 'Emitiendo…' : 'Emitir en SII las del día' }}
        </button>
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Vuelta</th>
              <th>Cliente</th>
              <th>Repartidor</th>
              <th class="num">Kg</th>
              <th class="num">Monto</th>
              <th>Estado</th>
              <th class="num">Impresiones</th>
              <th>SII (guía electrónica)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (g of guias(); track g.id) {
              <tr [class.anulada]="g.estado === 'ANULADA'">
                <td>
                  <strong>{{ g.id }}</strong>
                  @if (g.reemplazaAId) {
                    <small class="reemplaza" title="Corrige a la guía anulada; su guía electrónica la referencia">reemplaza N° {{ g.reemplazaAId }}</small>
                  }
                </td>
                <td>{{ g.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                <td>{{ nombreVuelta[g.vuelta] }}</td>
                <td>{{ g.cliente.nombre }}</td>
                <td>{{ g.repartidor?.nombre ?? 'Presencial' }}</td>
                <td class="num">{{ num(g.kg) | number: '1.0-3' }}</td>
                <td class="num">{{ num(g.monto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td>
                  @if (g.estado === 'ANULADA') {
                    <span class="pp-chip anulada-chip" [title]="g.motivoAnulacion ?? ''">Anulada</span>
                  } @else {
                    <span class="pp-chip">Vigente</span>
                  }
                </td>
                <td class="num">{{ g.impresiones }}</td>
                <td class="sii-celda">
                  @if (g.dteEstado === 'EMITIDA') {
                    <span class="pp-chip ok-chip" [title]="'Ambiente: ' + (g.dteAmbiente ?? '')">Folio {{ g.dteFolio }}</span>
                    @if (g.dtePdfPath) {
                      <button type="button" class="enlace" [disabled]="trabajando()" (click)="verPdf(g)">PDF</button>
                    }
                    @if (g.dteError) {
                      <small class="aviso aviso--texto" [title]="g.dteError">⚠ {{ g.dteError }}</small>
                    }
                    @if (g.dteAnuladaEn) {
                      <small class="anulada-sii">Anulada en el SII (manual) · {{ g.dteAnuladaEn | date: 'dd-MM-yyyy HH:mm' }}</small>
                    }
                  } @else if (g.cliente.modalidad === 'PRESENCIAL' && g.facturaRetiro?.dteEstado === 'EMITIDA') {
                    @let fr = g.facturaRetiro!;
                    <span class="pp-chip ok-chip" title="Cliente presencial: factura emitida al retirar">Factura {{ fr.dteFolio }}</span>
                    @if (fr.conPdf) {
                      <button type="button" class="enlace" [disabled]="trabajando()" (click)="verPdfFactura(fr.id)">PDF</button>
                    }
                  } @else if (g.estado === 'VIGENTE' && g.cliente.modalidad === 'PRESENCIAL') {
                    @if (g.facturaRetiro?.dteEstado === 'RECHAZADA') {
                      <span class="pp-chip anulada-chip" [title]="g.facturaRetiro?.dteError ?? ''">Factura rechazada</span>
                    }
                    <button
                      type="button"
                      class="pp-btn pp-btn--chico"
                      title="Cliente presencial: no lleva guía electrónica; se emite una factura por el retiro"
                      [disabled]="trabajando() || !sii()?.listo"
                      (click)="facturarRetiro(g)"
                    >
                      {{ g.facturaRetiro ? 'Reintentar factura' : 'Facturar retiro' }}
                    </button>
                    @if (g.facturaRetiro?.dteEstado === 'RECHAZADA' && g.facturaRetiro?.dteError) {
                      <small class="motivo" [title]="g.facturaRetiro?.dteError ?? ''">{{ g.facturaRetiro?.dteError }}</small>
                    }
                  } @else if (g.estado === 'VIGENTE') {
                    @if (g.dteEstado === 'RECHAZADA') {
                      <span class="pp-chip anulada-chip" [title]="g.dteError ?? ''">Rechazada</span>
                    }
                    <button
                      type="button"
                      class="pp-btn pp-btn--chico"
                      [disabled]="trabajando() || !sii()?.listo"
                      (click)="emitirSii(g)"
                    >
                      {{ g.dteEstado === 'RECHAZADA' ? 'Reintentar' : 'Emitir en SII' }}
                    </button>
                    @if (g.dteEstado === 'RECHAZADA' && g.dteError) {
                      <small class="motivo" [title]="g.dteError">{{ g.dteError }}</small>
                    }
                  } @else {
                    <span class="pp-texto-suave">—</span>
                  }
                </td>
                <td class="botones">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="imprimir(g)">Imprimir</button>
                  @if (g.estado === 'VIGENTE') {
                    <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="anular(g)">Anular</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="11" class="pp-texto-suave">{{ cargando() ? 'Buscando…' : 'No hay guías para ese filtro.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
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
    .check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 1.4rem;
      font-size: 0.9rem;
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
    .botones button + button {
      margin-left: 0.35rem;
    }
    tr.anulada td {
      color: var(--pp-texto-suave);
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
    .enlace {
      margin-left: 0.35rem;
      border: none;
      background: none;
      color: var(--pp-celeste-oscuro);
      font: 600 0.85rem var(--pp-fuente);
      text-decoration: underline;
      cursor: pointer;
    }
    .reemplaza {
      display: block;
      font-size: 0.75rem;
      color: var(--pp-texto-suave, #5b6b78);
      white-space: nowrap;
    }
    .motivo {
      display: block;
      max-width: 22rem;
      margin-top: 0.2rem;
      white-space: normal;
      font-size: 0.72rem;
      color: var(--pp-error);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }
    .aviso {
      display: block;
      color: var(--pp-alerta);
      font-size: 0.72rem;
    }
    .aviso--texto {
      max-width: 22rem;
      white-space: normal;
    }
    .anulada-sii {
      display: block;
      color: var(--pp-error);
      font-size: 0.75rem;
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class GuiasComponent {
  private readonly api = inject(DespachoService);

  protected readonly nombreVuelta = NOMBRE_VUELTA;
  protected readonly filtroFecha = hoyISO();
  protected readonly guias = signal<Guia[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly sii = signal<EstadoEmisionDte | null>(null);
  protected readonly trabajando = signal(false);

  private ultimoFiltro: { fecha?: string; numero?: number; clienteId?: number; incluirAnuladas?: boolean } = {
    fecha: this.filtroFecha,
  };

  constructor() {
    this.api.clientes(true).subscribe({ next: (c) => this.clientes.set(c) });
    this.api.estadoDte().subscribe({ next: (e) => this.sii.set(e) });
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  buscar(fecha: string, numero: string, clienteId: string, incluirAnuladas: boolean): void {
    this.ultimoFiltro = {
      fecha: fecha || undefined,
      numero: numero ? Number(numero) : undefined,
      clienteId: clienteId ? Number(clienteId) : undefined,
      incluirAnuladas,
    };
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.guias(this.ultimoFiltro).subscribe({
      next: (g) => {
        this.guias.set(g);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar las guías.'));
        this.cargando.set(false);
      },
    });
  }

  imprimir(g: Guia): void {
    // La impresión se registra solo si se confirma en la pestaña de impresión
    abrirImpresionGuias([g.id]);
  }

  /** Convierte la guía interna en guía de despacho electrónica (DTE 52) */
  emitirSii(g: Guia): void {
    this.trabajando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.api.emitirDte(g.id).subscribe({
      next: (r) => {
        this.trabajando.set(false);
        this.mensaje.set(`Guía N° ${g.id} emitida en el SII con folio ${r.dteFolio}.`);
        this.cargar();
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(`Guía N° ${g.id}: ${mensajeError(e)}`);
        this.cargar();
      },
    });
  }

  /** Cliente presencial: emite en el SII la factura de su retiro (no lleva guía electrónica) */
  facturarRetiro(g: Guia): void {
    this.trabajando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.api.facturarRetiros([g.id]).subscribe({
      next: (r) => {
        this.trabajando.set(false);
        if (r.errores.length) this.error.set(`Guía N° ${g.id}: ${r.errores[0].mensaje}`);
        else if (r.emitidas.length) this.mensaje.set(`Retiro de la guía N° ${g.id} facturado en el SII con folio ${r.emitidas[0].folio}.`);
        this.cargar();
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(`Guía N° ${g.id}: ${mensajeError(e)}`);
        this.cargar();
      },
    });
  }

  /** Abre el PDF timbrado de la factura de un retiro */
  verPdfFactura(facturaId: number): void {
    this.trabajando.set(true);
    this.api.pdfFactura(facturaId).subscribe({
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

  emitirDia(fecha: string): void {
    if (!confirm(`Se emitirán en el SII todas las guías vigentes del ${fecha} que aún no tienen folio. ¿Continuar?`)) return;
    this.trabajando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    this.api.emitirDteDia(fecha).subscribe({
      next: (r) => {
        this.trabajando.set(false);
        if (r.total === 0) this.mensaje.set('No hay guías pendientes de emitir en el SII para esa fecha.');
        else this.mensaje.set(`Emitidas en el SII: ${r.emitidas.length} de ${r.total}.`);
        if (r.errores.length) {
          this.error.set('Con problemas: ' + r.errores.map((x) => `N° ${x.guiaId}: ${x.mensaje}`).join(' · '));
        }
        this.ultimoFiltro = { ...this.ultimoFiltro, fecha };
        this.cargar();
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  /** Abre el PDF oficial (con timbre electrónico) que entregó el proveedor */
  verPdf(g: Guia): void {
    this.trabajando.set(true);
    this.api.pdfDte(g.id).subscribe({
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

  anular(g: Guia): void {
    if (g.facturaMensualId) {
      this.error.set(`La guía N° ${g.id} está incluida en la factura mensual N° ${g.facturaMensualId}. Anule primero esa factura (pestaña Facturación).`);
      return;
    }
    // Una guía electrónica no se anula con nota de crédito ni por API: se anula a mano en el portal (los folios simulados no existen allá)
    const enSii = g.dteEstado === 'EMITIDA' && g.dteAmbiente !== 'SIMULADO';
    if (
      enSii &&
      !confirm(
        `La guía N° ${g.id} tiene la guía electrónica folio ${g.dteFolio} en el SII.\n\n` +
          'Primero anúlela en el "Registro de Guías de Despacho" del SII o en el portal del proveedor (OpenFactura). ' +
          'Una guía de despacho no se anula con nota de crédito.\n\n¿Ya la anuló en el portal?',
      )
    ) {
      return;
    }
    const motivo = prompt(`Anular guía N° ${g.id} (${g.cliente.nombre}).\nIndique el motivo (queda registrado en la auditoría):`);
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      this.error.set('Debe indicar un motivo de al menos 5 caracteres.');
      return;
    }
    this.mensaje.set(null);
    this.api.anularGuia(g.id, motivo.trim(), enSii).subscribe({
      next: () => {
        const sii = enSii ? ' Quedó registrado que la guía electrónica se anuló en el SII.' : '';
        this.mensaje.set(`Guía N° ${g.id} anulada.${sii} Ahora puede corregir los kg en la planilla y emitir una nueva.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
