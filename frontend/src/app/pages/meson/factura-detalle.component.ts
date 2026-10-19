import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { Factura } from '../../core/models';
import { MesonService } from './meson.service';

const MAX_MB = 10;

/** [MESÓN] Detalle de una factura: líneas, respaldo (foto/PDF) y anulación */
@Component({
  selector: 'app-factura-detalle',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/facturas" class="volver no-imprimir">← Facturas</a>

    @if (aviso()) {
      <p class="pp-alerta-error" role="alert">{{ aviso() }}</p>
    }
    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (factura(); as f) {
      <header class="encabezado">
        <div>
          <h1>
            Factura N° {{ f.numero }}
            @if (f.estado === 'ANULADA') {
              <span class="pp-chip anulada-chip">Anulada</span>
            } @else {
              <span class="pp-chip">Vigente</span>
            }
          </h1>
          <p class="pp-texto-suave">
            {{ f.proveedor.razonSocial }} · RUT {{ f.proveedor.rut }} · emitida el {{ f.fecha | date: 'dd-MM-yyyy' : 'UTC' }}
          </p>
        </div>
        @if (f.estado === 'VIGENTE') {
          <button type="button" class="pp-btn pp-btn--peligro no-imprimir" [disabled]="trabajando()" (click)="anular(f)">Anular factura</button>
        }
      </header>

      @if (f.estado === 'ANULADA') {
        <section class="pp-card anulada-info">
          <strong>Anulada</strong> el {{ f.anuladaEn | date: 'dd-MM-yyyy HH:mm' }} por {{ f.anuladaPor ?? '—' }}.
          Motivo: {{ f.motivoAnulacion }}. Su mercadería se descontó del stock.
        </section>
      }

      <div class="columnas">
        <section class="pp-card">
          <h2>Detalle</h2>
          <div class="tabla-scroll">
            <table class="pp-tabla">
              <thead>
                <tr>
                  <th>PLU</th>
                  <th>Producto</th>
                  <th class="num">Cantidad</th>
                  <th class="num">Costo unit. neto</th>
                  <th class="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                @for (d of f.detalles; track d.id) {
                  <tr>
                    <td><code>{{ d.producto?.plu ?? '—' }}</code></td>
                    <td>
                      {{ d.producto?.nombre ?? d.descripcion }}
                      @if (!d.producto) {
                        <span class="pp-chip">no registrado · no suma stock</span>
                      }
                    </td>
                    <td class="num">{{ num(d.cantidad) | number: '1.0-3' }} {{ d.producto ? (d.producto.unidad === 'KG' ? 'kg' : 'un.') : '' }}</td>
                    <td class="num">{{ num(d.costoUnitario) | currency: 'CLP' : 'symbol-narrow' : '1.0-2' }}</td>
                    <td class="num">{{ num(d.subtotal) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="pp-texto-suave">Registrada sin detalle de productos (ver la foto o PDF adjunto).</td></tr>
                }
              </tbody>
              <tfoot>
                <tr><td colspan="4" class="num">Neto</td><td class="num">{{ num(f.neto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td></tr>
                <tr><td colspan="4" class="num">IVA</td><td class="num">{{ num(f.iva) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td></tr>
                <tr class="total"><td colspan="4" class="num">Total</td><td class="num">{{ num(f.total) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td></tr>
              </tfoot>
            </table>
          </div>
          @if (f.observacion) {
            <p class="obs"><strong>Observación:</strong> {{ f.observacion }}</p>
          }
          <p class="meta">
            Registrada el {{ f.creadoEn | date: 'dd-MM-yyyy HH:mm' }} por {{ f.creadoPor ?? '—' }}.
            @if (f.estado === 'VIGENTE' && conStock(f) > 0) {
              Su mercadería ya está sumada al stock.
            }
          </p>
        </section>

        <section class="pp-card respaldo no-imprimir">
          <h2>Respaldo</h2>
          @if (f.archivoPath) {
            <p class="archivo">{{ f.archivoNombre }}</p>
            <button type="button" class="pp-btn pp-btn--chico" [disabled]="trabajando()" (click)="verArchivo(f.id)">Ver {{ f.archivoTipo === 'application/pdf' ? 'PDF' : 'foto' }}</button>
            @if (vistaImagen()) {
              <img [src]="vistaImagen()" alt="Foto de la factura" class="vista" />
            }
          } @else {
            <p class="falta">Esta factura aún no tiene foto ni PDF.</p>
          }
          @if (f.estado === 'VIGENTE') {
            <label class="subir">
              {{ f.archivoPath ? 'Reemplazar archivo' : 'Adjuntar foto o PDF' }}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" [disabled]="trabajando()" (change)="adjuntar(f.id, $event)" />
            </label>
            <small class="pp-texto-suave">PDF, JPG, PNG o WEBP, hasta 10 MB. El archivo anterior queda guardado.</small>
          }
        </section>
      </div>
    } @else if (!error()) {
      <p class="pp-texto-suave">Cargando…</p>
    }
  `,
  styles: `
    .volver {
      display: inline-block;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.5rem;
    }
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .encabezado h1 {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .encabezado p {
      margin: 0;
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
    .anulada-info {
      margin-bottom: 1rem;
      border-left: 5px solid var(--pp-error);
      background: #fff5f5;
    }
    .columnas {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 900px) {
      .columnas {
        grid-template-columns: 1fr;
      }
    }
    h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    tfoot td {
      border-top: 1px solid var(--pp-borde);
    }
    tfoot .total td {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .obs {
      margin: 0.75rem 0 0;
      font-size: 0.9rem;
    }
    .meta {
      margin: 0.5rem 0 0;
      font-size: 0.8rem;
      color: var(--pp-texto-suave);
    }
    .archivo {
      margin: 0 0 0.5rem;
      font-weight: 600;
      word-break: break-all;
    }
    .falta {
      margin: 0 0 0.75rem;
      color: var(--pp-alerta);
      font-weight: 600;
    }
    .vista {
      display: block;
      width: 100%;
      margin-top: 0.75rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
    }
    .subir {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      margin-top: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
    }
  `,
})
export class FacturaDetalleComponent {
  private readonly api = inject(MesonService);
  private readonly route = inject(ActivatedRoute);

  protected readonly factura = signal<Factura | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly vistaImagen = signal<string | null>(null);
  private urlTemporal: string | null = null;

  constructor() {
    const estado = (history.state ?? {}) as { aviso?: string | null; nueva?: boolean };
    if (estado.aviso) this.aviso.set(estado.aviso);
    else if (estado.nueva) this.mensaje.set('Factura registrada. Su mercadería ya se sumó al stock.');

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('Factura no válida.');
    } else {
      this.cargar(id);
    }
    inject(DestroyRef).onDestroy(() => this.liberarUrl());
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  private cargar(id: number): void {
    this.api.factura(id).subscribe({
      next: (f) => this.factura.set(f),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar la factura.')),
    });
  }

  verArchivo(id: number): void {
    this.trabajando.set(true);
    this.api.archivoFactura(id).subscribe({
      next: (blob) => {
        this.trabajando.set(false);
        this.liberarUrl();
        this.urlTemporal = URL.createObjectURL(blob);
        if (blob.type === 'application/pdf') {
          window.open(this.urlTemporal, '_blank');
        } else {
          this.vistaImagen.set(this.urlTemporal);
        }
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e, 'No se pudo abrir el archivo.'));
      },
    });
  }

  adjuntar(id: number, evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;
    if (archivo.size > MAX_MB * 1024 * 1024) {
      this.error.set(`El archivo pesa más de ${MAX_MB} MB.`);
      input.value = '';
      return;
    }
    this.limpiar();
    this.trabajando.set(true);
    this.api.adjuntarArchivo(id, archivo).subscribe({
      next: (f) => {
        this.trabajando.set(false);
        this.liberarUrl();
        this.factura.set(f);
        this.mensaje.set('Archivo adjuntado.');
        input.value = '';
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e, 'No se pudo subir el archivo.'));
        input.value = '';
      },
    });
  }

  /** Líneas con producto del catálogo (las que suman stock) */
  protected conStock(f: Factura): number {
    return f.detalles.filter((d) => d.productoId !== null).length;
  }

  anular(f: Factura): void {
    const motivo = prompt(
      `Anular la factura N° ${f.numero} de ${f.proveedor.razonSocial}.\n` +
        `Se descontará del stock la mercadería que sumó (${this.conStock(f)} línea(s) con producto).\n\n` +
        'Indique el motivo (queda registrado en la auditoría):',
    );
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      this.error.set('Debe indicar un motivo de al menos 5 caracteres.');
      return;
    }
    this.limpiar();
    this.trabajando.set(true);
    this.api.anularFactura(f.id, motivo.trim()).subscribe({
      next: (actualizada) => {
        this.trabajando.set(false);
        this.factura.set(actualizada);
        this.mensaje.set('Factura anulada y stock revertido. Si había un error, registre la factura correcta.');
      },
      error: (e) => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  private limpiar(): void {
    this.error.set(null);
    this.mensaje.set(null);
    this.aviso.set(null);
  }

  private liberarUrl(): void {
    if (this.urlTemporal) URL.revokeObjectURL(this.urlTemporal);
    this.urlTemporal = null;
    this.vistaImagen.set(null);
  }
}
