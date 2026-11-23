import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { map, switchMap } from 'rxjs';
import { mensajeError } from '../../core/errores';
import { Guia, NOMBRE_MODALIDAD, NOMBRE_VUELTA } from '../../core/models';
import { LogoComponent } from '../../layout/logo.component';
import { DespachoService } from '../despacho/despacho.service';

/**
 * Vista de impresión de guías. Uso: /imprimir/guias?ids=12,13,14
 * Antes de imprimir envía al SII las guías que aún no tienen folio (Res. SII 144/2026: la guía debe estar
 * en el SII antes de que salga el reparto). Las que tienen PDF timbrado del proveedor se imprimen con ese
 * documento oficial; el resto como guía interna (una por hoja carta), marcada "SIN FOLIO SII" si no se pudo enviar.
 * Al confirmar la impresión, una reimpresión de la guía interna sale marcada "COPIA".
 */
@Component({
  selector: 'app-imprimir-guias',
  imports: [LogoComponent, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <div class="barra-impresion no-imprimir">
      <span>
        @if (enviando()) {
          Enviando las guías al SII…
        } @else {
          {{ guias().length }} guía(s)
          @if (conPdf().length) {
            · {{ conPdf().length }} guía(s) electrónica(s) timbrada(s)
          }
          @if (internas().length) {
            · {{ internas().length }} guía(s) interna(s), una por hoja carta
          }
        }
      </span>
      <div>
        @if (pdfUrl()) {
          <button type="button" class="pp-btn" (click)="imprimirPdf()">Imprimir documentos SII ({{ conPdf().length }})</button>
        }
        @if (internas().length) {
          <button type="button" class="pp-btn" [class.pp-btn--secundario]="pdfUrl()" (click)="imprimir()">
            {{ pdfUrl() ? 'Imprimir guías internas (' + internas().length + ')' : 'Imprimir' }}
          </button>
        }
        <button type="button" class="pp-btn pp-btn--secundario" (click)="cerrar()">Cerrar</button>
      </div>
    </div>

    @if (!enviando() && sinFolio().length) {
      <div class="alerta-sii no-imprimir" role="alert">
        <strong>{{ sinFolio().length }} documento(s) sin folio del SII: no entregue el pan con ellos.</strong>
        <span>La guía de reparto debe estar en el SII antes de salir (Res. SII 144/2026) y cada retiro presencial lleva su factura.</span>
        @if (omitida()) {
          <span>{{ omitida() }}</span>
        }
        <ul>
          @for (g of sinFolio(); track g.id) {
            <li>N° {{ g.id }} · {{ g.cliente.nombre }}{{ erroresSii().get(g.id) ? ': ' + erroresSii().get(g.id) : '' }}</li>
          }
        </ul>
        <button type="button" class="pp-btn" [disabled]="enviando()" (click)="reintentar()">Reintentar envío al SII</button>
      </div>
    }

    @if (preguntar()) {
      <div class="confirmacion no-imprimir" role="alertdialog" aria-live="assertive">
        <strong>¿Las guías se imprimieron correctamente?</strong>
        <span class="pp-texto-suave">Solo si responde "Sí", una próxima impresión saldrá marcada como COPIA.</span>
        <div>
          <button type="button" class="pp-btn" (click)="confirmar()">Sí, se imprimieron</button>
          <button type="button" class="pp-btn pp-btn--secundario" (click)="noImpresas()">No se imprimieron</button>
        </div>
      </div>
    }
    @if (aviso()) {
      <p class="pp-aviso-ok no-imprimir aviso-impresion">{{ aviso() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error no-imprimir">{{ error() }}</p>
    }

    @if (pdfUrl()) {
      <section class="pdf no-imprimir">
        <p class="pp-texto-suave">Documentos timbrados del SII: la guía de despacho que lleva el repartidor o la factura del retiro que se entrega al cliente presencial.</p>
        <iframe #marcoPdf [src]="pdfUrl()" title="Documentos timbrados del SII" (load)="pdfCargado()"></iframe>
      </section>
    }

    <div class="hojas">
      @for (g of internas(); track g.id) {
        <article class="guia" [class.anulada]="g.estado === 'ANULADA'">
          @if (g.estado === 'ANULADA') {
            <div class="marca">ANULADA</div>
          } @else if (sinFolioSii(g)) {
            <div class="marca marca--sii">SIN FOLIO SII</div>
          } @else if (g.esCopia) {
            <div class="marca">COPIA</div>
          }
          @if (sinFolioSii(g)) {
            <p class="franja-sii">
              {{ presencial(g) ? 'SIN FACTURA DEL SII · EMÍTALA ANTES DE ENTREGAR EL PAN' : 'SIN FOLIO DEL SII · NO VÁLIDA PARA EL TRASLADO DEL PAN' }}
            </p>
          }

          <header class="cabecera">
            <app-logo [tamano]="'grande'" />
            <div class="folio">
              <p class="tipo">GUÍA DE ENTREGA</p>
              <p class="numero">N° {{ folio(g.id) }}</p>
              <p>Fecha: <strong>{{ g.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</strong></p>
              <p>Entrega: <strong>{{ nombreVuelta[g.vuelta] }}</strong></p>
              @if (g.dteEstado === 'EMITIDA') {
                <p class="sii">Guía de despacho electrónica SII N° <strong>{{ g.dteFolio }}</strong></p>
              }
            </div>
          </header>

          <dl class="datos">
            <div><dt>Cliente</dt><dd>{{ g.cliente.nombre }}</dd></div>
            <div><dt>Modalidad</dt><dd>{{ nombreModalidad[g.cliente.modalidad] }}</dd></div>
            <div>
              <dt>Repartidor</dt>
              <dd>{{ g.repartidor ? g.repartidor.nombre + (g.repartidor.patente ? ' · ' + g.repartidor.patente : '') : 'Retiro en panadería' }}</dd>
            </div>
            <div><dt>Dirección</dt><dd>{{ g.cliente.direccion ?? '—' }}</dd></div>
          </dl>

          <table class="detalle">
            <thead>
              <tr>
                <th>Kg despachados</th>
                <th>Kg descuento</th>
                <th>Kg cobrados</th>
                <th>Precio por kg</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="destacado">{{ num(g.kg) | number: '1.0-3' }} kg</td>
                <td>{{ num(g.kgDescuento) > 0 ? (num(g.kgDescuento) | number: '1.0-3') + ' kg' : '—' }}</td>
                <td>{{ cobrados(g) | number: '1.0-3' }} kg</td>
                <td>{{ num(g.precioKg) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="destacado">{{ num(g.monto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
              </tr>
            </tbody>
          </table>

          <p class="aviso">Cliente: verifique el peso del pan al recibirlo. Ante cualquier diferencia, comuníquese con la panadería.</p>
          <p class="legal">
            {{
              g.dteEstado === 'EMITIDA'
                ? 'Respaldo interno de la guía de despacho electrónica SII N° ' + g.dteFolio
                : presencial(g)
                  ? 'Documento interno de retiro en la panadería: la factura de este retiro aún no se emite en el SII'
                  : 'Documento interno de control de despacho, no válido como documento tributario'
            }} ·
            Emitida {{ g.creadoEn | date: 'dd-MM-yyyy HH:mm' }}
            @if (g.estado === 'ANULADA') {
              · Anulada: {{ g.motivoAnulacion }}
            }
          </p>
        </article>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      background: #e9eef2;
      min-height: 100vh;
    }
    .barra-impresion {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.6rem 1rem;
      background: var(--pp-blanco);
      border-bottom: 3px solid var(--pp-celeste);
      z-index: 5;
    }
    .barra-impresion button + button {
      margin-left: 0.5rem;
    }
    .confirmacion {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      max-width: 200mm;
      margin: 1rem auto 0;
      padding: 1rem;
      background: #fff8ec;
      border: 2px solid var(--pp-alerta);
      border-radius: 10px;
      text-align: center;
    }
    .confirmacion button + button {
      margin-left: 0.5rem;
    }
    .aviso-impresion {
      max-width: 200mm;
      margin: 1rem auto 0;
    }
    .alerta-sii {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      max-width: 200mm;
      margin: 1rem auto 0;
      padding: 1rem;
      background: #fdeded;
      border: 2px solid #d64545;
      border-radius: 10px;
      color: #7a1f1f;
    }
    .alerta-sii ul {
      margin: 0.25rem 0;
      padding-left: 1.2rem;
    }
    .alerta-sii button {
      align-self: flex-start;
    }
    .pdf {
      max-width: 216mm;
      margin: 1rem auto 0;
    }
    .pdf iframe {
      width: 100%;
      height: 80vh;
      border: 1px solid #9fb6c6;
      border-radius: 8px;
      background: #fff;
    }
    .marca--sii {
      font-size: 54pt;
      white-space: nowrap;
    }
    .franja-sii {
      margin: 0 0 4mm;
      padding: 2mm;
      border: 2px solid #d64545;
      color: #d64545;
      font-weight: 800;
      text-align: center;
      font-size: 11pt;
    }
    .hojas {
      padding: 1rem 0;
    }
    /* Una guía por hoja carta (215,9 × 279,4 mm, márgenes de 8 mm) */
    .guia {
      position: relative;
      box-sizing: border-box;
      width: 200mm;
      height: 263mm;
      margin: 0 auto 6mm;
      padding: 12mm 12mm 10mm;
      background: #fff;
      color: #111;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-size: 13pt;
    }
    .marca {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 110pt;
      font-weight: 800;
      letter-spacing: 0.2em;
      color: rgba(214, 69, 69, 0.18);
      pointer-events: none;
    }
    .cabecera {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1b99e5;
      padding-bottom: 6mm;
    }
    .folio {
      text-align: right;
      border: 2px solid #1b99e5;
      border-radius: 8px;
      padding: 3mm 6mm;
    }
    .folio p {
      margin: 0;
    }
    .tipo {
      font-weight: 800;
      color: #0f6fae;
      letter-spacing: 0.05em;
    }
    .numero {
      font-size: 24pt;
      font-weight: 800;
    }
    .sii {
      margin-top: 2mm;
      padding: 1mm 2mm;
      border: 1px solid #333;
      font-size: 9pt;
    }
    .datos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm 10mm;
      margin: 10mm 0;
    }
    .datos div {
      display: flex;
      gap: 2mm;
    }
    .datos dt {
      font-weight: 700;
      min-width: 28mm;
    }
    .datos dd {
      margin: 0;
    }
    .detalle {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
    }
    .detalle th,
    .detalle td {
      border: 1px solid #9fb6c6;
      padding: 5mm 3mm;
    }
    .detalle th {
      background: #e8f5fd;
      font-size: 11pt;
    }
    .destacado {
      font-size: 22pt;
      font-weight: 800;
    }
    .aviso {
      font-size: 11pt;
      margin: 8mm 0 0;
    }
    .legal {
      font-size: 9pt;
      color: #555;
      margin: auto 0 0;
      padding-top: 4mm;
      border-top: 1px solid #ddd;
      text-align: center;
    }
    @media print {
      :host {
        background: #fff;
      }
      .hojas {
        padding: 0;
      }
      .guia {
        margin: 0 auto;
        break-after: page;
      }
      .guia:last-child {
        break-after: auto;
      }
    }
  `,
})
export class ImprimirGuiasComponent implements OnDestroy {
  private readonly api = inject(DespachoService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly nombreVuelta = NOMBRE_VUELTA;
  protected readonly guias = signal<Guia[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  /** Se muestra al cerrar el diálogo de impresión: el navegador no informa si se imprimió o se canceló */
  protected readonly preguntar = signal(false);

  /** Envío al SII antes de imprimir (Res. SII 144/2026: la guía debe estar en el SII antes de salir) */
  protected readonly enviando = signal(false);
  protected readonly erroresSii = signal(new Map<number, string>());
  /** Por qué no se envió nada (emisión no configurada o sin conexión) */
  protected readonly omitida = signal<string | null>(null);

  /** Guías que van en el PDF timbrado del proveedor; el resto se imprime como guía interna */
  protected readonly conPdf = signal<number[]>([]);
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly internas = computed(() => this.guias().filter((g) => !this.conPdf().includes(g.id)));
  protected readonly sinFolio = computed(() => this.guias().filter((g) => this.sinFolioSii(g)));
  private readonly marco = viewChild<ElementRef<HTMLIFrameElement>>('marcoPdf');
  private urlPdf: string | null = null;
  private autoImprimirPdf = false;
  private ids: number[] = [];

  constructor() {
    this.ids = (this.route.snapshot.queryParamMap.get('ids') ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);

    if (this.ids.length === 0) {
      this.error.set('No se indicaron guías para imprimir.');
      return;
    }

    window.addEventListener('afterprint', () => this.preguntar.set(this.guias().length > 0));
    this.enviarYCargar(this.ids, true);
  }

  ngOnDestroy(): void {
    if (this.urlPdf) URL.revokeObjectURL(this.urlPdf);
  }

  /**
   * Retiro o reparto sin su documento SII: la guía electrónica (reparto) o, para un cliente presencial,
   * la factura del retiro (retira en la panadería y no lleva guía electrónica)
   */
  protected sinFolioSii(g: Guia): boolean {
    if (g.estado !== 'VIGENTE') return false;
    return this.presencial(g) ? g.facturaRetiro?.dteEstado !== 'EMITIDA' : g.dteEstado !== 'EMITIDA';
  }

  protected presencial(g: Guia): boolean {
    return g.cliente.modalidad === 'PRESENCIAL';
  }

  /** Vuelve a enviar al SII las guías que quedaron sin folio */
  reintentar(): void {
    this.error.set(null);
    this.enviarYCargar(
      this.sinFolio().map((g) => g.id),
      false,
    );
  }

  /**
   * Envía al SII lo que aún no tiene folio y luego carga lo que se imprime: la guía electrónica de cada reparto
   * y la factura de cada retiro presencial (el backend ignora en cada llamada las guías que no le corresponden)
   */
  private enviarYCargar(aEnviar: number[], autoImprimir: boolean): void {
    this.enviando.set(true);
    this.api
      .emitirDteGuias(aEnviar)
      .pipe(switchMap((r) => this.api.facturarRetiros(aEnviar).pipe(map((f) => ({ ...r, errores: [...r.errores, ...f.errores] })))))
      .subscribe({
      next: (r) => {
        const errores = new Map(this.erroresSii());
        aEnviar.forEach((id) => errores.delete(id));
        r.errores.forEach((e) => errores.set(e.guiaId, e.mensaje));
        this.erroresSii.set(errores);
        this.omitida.set(r.omitida);
        this.enviando.set(false);
        this.cargar(autoImprimir);
      },
      error: (e) => {
        this.omitida.set(mensajeError(e, 'No se pudo conectar con el SII.'));
        this.enviando.set(false);
        this.cargar(autoImprimir);
      },
    });
  }

  private cargar(autoImprimir: boolean): void {
    this.api.guiasParaImprimir(this.ids).subscribe({
      next: (data) => {
        this.guias.set(data);
        // PDF timbrado: la guía electrónica del reparto o la factura del retiro presencial
        const conPdf = data
          .filter(
            (g) =>
              g.estado === 'VIGENTE' &&
              ((g.dteEstado === 'EMITIDA' && g.dtePdfPath) || (g.facturaRetiro?.dteEstado === 'EMITIDA' && g.facturaRetiro.conPdf)),
          )
          .map((g) => g.id);
        if (conPdf.length) {
          this.cargarPdf(conPdf, autoImprimir);
        } else {
          this.quitarPdf();
          if (autoImprimir) this.autoImprimirInternas();
        }
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudieron cargar las guías.')),
    });
  }

  private cargarPdf(ids: number[], autoImprimir: boolean): void {
    this.api.pdfDteLote(ids).subscribe({
      next: (resp) => {
        const incluidas = (resp.headers.get('X-Guias-Incluidas') ?? '')
          .split(',')
          .map((x) => Number(x))
          .filter((x) => x > 0);
        this.quitarPdf();
        this.urlPdf = URL.createObjectURL(resp.body as Blob);
        this.conPdf.set(incluidas.length ? incluidas : ids);
        // Se imprime sola únicamente si todo va en el PDF; si también hay guías internas, el usuario elige qué imprimir
        this.autoImprimirPdf = autoImprimir && this.internas().length === 0;
        if (autoImprimir && !this.autoImprimirPdf) {
          this.aviso.set('Hay guías electrónicas timbradas y guías internas: imprima cada grupo con su botón.');
        }
        this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.urlPdf));
      },
      error: (e) => {
        this.quitarPdf();
        this.error.set(mensajeError(e, 'No se pudo cargar el PDF timbrado: se muestran las guías internas.'));
        if (autoImprimir) this.autoImprimirInternas();
      },
    });
  }

  private quitarPdf(): void {
    if (this.urlPdf) URL.revokeObjectURL(this.urlPdf);
    this.urlPdf = null;
    this.pdfUrl.set(null);
    this.conPdf.set([]);
  }

  private autoImprimirInternas(): void {
    // Espera a que carguen las fuentes antes de abrir el diálogo de impresión
    void document.fonts.ready.then(() => setTimeout(() => this.imprimir(), 300));
  }

  /** El PDF timbrado terminó de cargar en el marco */
  pdfCargado(): void {
    if (!this.urlPdf || !this.autoImprimirPdf) return;
    this.autoImprimirPdf = false;
    setTimeout(() => this.imprimirPdf(), 300);
  }

  /** Imprime el PDF timbrado (el visor del navegador dentro del marco) */
  imprimirPdf(): void {
    this.aviso.set(null);
    this.preguntar.set(false);
    const ventana = this.marco()?.nativeElement.contentWindow;
    try {
      ventana?.focus();
      ventana?.print();
    } catch {
      // Si el navegador no deja imprimir el marco, se abre el PDF en otra pestaña
      if (this.urlPdf) window.open(this.urlPdf, '_blank');
    }
    this.preguntar.set(true);
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  protected cobrados(g: Guia): number {
    return Math.max(this.num(g.kg) - this.num(g.kgDescuento), 0);
  }

  protected folio(id: number): string {
    return String(id).padStart(6, '0');
  }

  imprimir(): void {
    this.aviso.set(null);
    this.preguntar.set(false);
    window.print();
    // En la mayoría de los navegadores window.print() espera a que se cierre el diálogo
    this.preguntar.set(true);
  }

  confirmar(): void {
    const ids = this.guias()
      .filter((g) => g.estado === 'VIGENTE')
      .map((g) => g.id);
    this.preguntar.set(false);
    if (ids.length === 0) return;
    this.api.confirmarImpresion(ids).subscribe({
      next: () => {
        // Desde ahora, si se vuelven a imprimir en esta pestaña, salen como COPIA
        this.guias.set(this.guias().map((g) => ({ ...g, esCopia: true })));
        this.aviso.set('Impresión registrada. Ya puede cerrar esta pestaña.');
      },
      error: (e) => this.error.set(mensajeError(e, 'No se pudo registrar la impresión.')),
    });
  }

  noImpresas(): void {
    this.preguntar.set(false);
    this.aviso.set('No se registró la impresión. Puede intentarlo de nuevo con "Imprimir".');
  }

  cerrar(): void {
    window.close();
  }
}
