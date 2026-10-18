import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { buscarPorCodigo } from '../../core/barras';
import { NuevaFactura, Producto, Proveedor } from '../../core/models';
import { hoyISO } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

interface LineaForm {
  clave: number;
  /** Lo escrito en el buscador de producto */
  texto: string;
  /** Producto del catálogo elegido (null = no registrado o aún sin elegir) */
  productoId: number | null;
  cantidad: number | null;
  costoUnitario: number | null;
}

const TASA_IVA = 0.19;
const MAX_MB = 10;

/** [MESÓN] Registrar una factura de mercadería: cabecera, líneas, IVA y foto/PDF */
@Component({
  selector: 'app-factura-nueva',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <a routerLink="/meson/facturas" class="volver">← Facturas</a>
        <h1>Registrar factura</h1>
        <p class="pp-texto-suave">
          Solo la <strong>foto o PDF</strong> es obligatoria, junto con proveedor, N° y fecha. El detalle de productos es opcional:
          los productos del catálogo suman stock; los aún no registrados quedan anotados sin mover stock.
        </p>
      </div>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <h2>Datos de la factura</h2>
      <div class="cabecera">
        <div class="pp-campo">
          <label for="proveedor">Proveedor *</label>
          <select id="proveedor" [value]="proveedorId() ?? ''" (change)="proveedorId.set(numOrNull($any($event.target).value))">
            <option value="">Seleccione…</option>
            @for (p of proveedores(); track p.id) {
              <option [value]="p.id">{{ p.razonSocial }} · {{ p.rut }}</option>
            }
          </select>
          @if (proveedores().length === 0 && !cargando()) {
            <small class="pp-texto-suave">No hay proveedores. <a routerLink="/meson/proveedores">Créelos aquí</a>.</small>
          }
        </div>
        <div class="pp-campo">
          <label for="numero">N° de factura *</label>
          <input id="numero" maxlength="30" [value]="numero()" (input)="numero.set($any($event.target).value)" />
        </div>
        <div class="pp-campo">
          <label for="fecha">Fecha de emisión *</label>
          <input id="fecha" type="date" [max]="hoy" [value]="fecha()" (change)="fecha.set($any($event.target).value)" />
        </div>
        <div class="pp-campo ancho">
          <label for="obs">Observación</label>
          <input id="obs" maxlength="255" placeholder="Opcional" [value]="observacion()" (input)="observacion.set($any($event.target).value)" />
        </div>
      </div>
    </section>

    <section class="pp-card">
      <h2>Detalle <small class="pp-texto-suave">(opcional)</small></h2>
      <datalist id="lista-productos">
        @for (p of productos(); track p.id) {
          <option [value]="etiqueta(p)"></option>
        }
      </datalist>
      <div class="escaner">
        <label for="escaner">Escanear código de barras o escribir el PLU</label>
        <input
          id="escaner"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Pase el lector y presione Enter"
          [value]="codigoEscaneado()"
          (input)="codigoEscaneado.set($any($event.target).value)"
          (keydown.enter)="escanear($event)"
        />
        @if (avisoEscaner()) {
          <span class="aviso-escaner">{{ avisoEscaner() }}</span>
        }
        @if (opcionesEscaner().length > 1) {
          <div class="opciones-escaner">
            <span>Ese código lo comparten varios productos:</span>
            @for (p of opcionesEscaner(); track p.id) {
              <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="agregarProducto(p.id)">{{ p.plu }} · {{ p.nombre }}</button>
            }
          </div>
        }
      </div>
      <div class="tabla-scroll">
        <table class="pp-tabla lineas">
          <thead>
            <tr>
              <th class="col-producto">Producto</th>
              <th class="num">Cantidad</th>
              <th class="num">Costo unitario neto</th>
              <th class="num">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of lineas(); track l.clave; let i = $index) {
              <tr>
                <td>
                  <input
                    class="buscador"
                    list="lista-productos"
                    autocomplete="off"
                    maxlength="150"
                    placeholder="Escriba parte del nombre o el PLU…"
                    [value]="l.texto"
                    (input)="escribirProducto(i, $any($event.target).value)"
                    [attr.aria-label]="'Producto línea ' + (i + 1)"
                  />
                  @if (l.texto.trim() && l.productoId === null) {
                    <small class="no-registrado">No está en el catálogo: se anota en la factura, pero no suma stock.</small>
                  }
                </td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
                    data-cantidad
                    [step]="unidadDe(l) === 'KG' ? 0.001 : 1"
                    [value]="l.cantidad ?? ''"
                    (input)="actualizar(i, 'cantidad', $any($event.target).value)"
                    [attr.aria-label]="'Cantidad línea ' + (i + 1)"
                  />
                  <span class="unidad">{{ unidadDe(l) === 'KG' ? 'kg' : unidadDe(l) === 'UNIDAD' ? 'un.' : '' }}</span>
                </td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    [value]="l.costoUnitario ?? ''"
                    (input)="actualizar(i, 'costoUnitario', $any($event.target).value)"
                    (keydown.enter)="enterEnCosto(i, $event)"
                    [attr.aria-label]="'Costo línea ' + (i + 1)"
                  />
                </td>
                <td class="num">{{ subtotal(l) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="derecha">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="quitar(i)" title="Quitar línea">✕</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico agregar" (click)="agregarLinea()">+ Agregar línea</button>

      <div class="totales">
        <div>
          <span>Neto</span>
          @if (sinLineas()) {
            <input
              type="number"
              min="0"
              step="1"
              class="iva"
              placeholder="Opcional"
              [value]="netoManual() ?? ''"
              (input)="netoManual.set(numOrNull($any($event.target).value))"
              aria-label="Neto de la factura"
            />
          } @else {
            <strong>{{ neto() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
          }
        </div>
        <div>
          <span>
            IVA
            <label class="auto"><input type="checkbox" [checked]="ivaAuto()" (change)="ivaAuto.set($any($event.target).checked)" /> 19 % automático</label>
          </span>
          @if (ivaAuto()) {
            <strong>{{ iva() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
          } @else {
            <input type="number" min="0" step="1" class="iva" [value]="ivaManual() ?? ''" (input)="ivaManual.set(numOrNull($any($event.target).value))" aria-label="IVA" />
          }
        </div>
        <div class="total"><span>Total</span><strong>{{ total() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
      </div>
      <p class="pp-texto-suave nota">
        Sin detalle de productos puede escribir el neto directamente. Si la factura tiene productos exentos, desmarque "19 % automático" e ingrese el IVA.
      </p>
    </section>

    <section class="pp-card">
      <h2>Foto o PDF de la factura *</h2>
      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" (change)="elegirArchivo($event)" />
      @if (archivo(); as a) {
        <p class="archivo">{{ a.name }} · {{ a.size / 1024 / 1024 | number: '1.1-1' }} MB</p>
      } @else {
        <p class="pp-texto-suave nota izq">Obligatoria. PDF, JPG, PNG o WEBP, hasta {{ maxMb }} MB. Desde el celular puede sacar la foto directamente.</p>
      }
    </section>

    <div class="acciones">
      <a routerLink="/meson/facturas" class="pp-btn pp-btn--secundario">Cancelar</a>
      <button type="button" class="pp-btn" [disabled]="guardando()" (click)="guardar()">
        {{ guardando() ? 'Guardando…' : 'Registrar factura' }}
      </button>
    </div>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .volver {
      font-size: 0.85rem;
      text-decoration: none;
    }
    section.pp-card {
      margin-bottom: 1rem;
    }
    section h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .cabecera {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      column-gap: 1rem;
    }
    .ancho {
      grid-column: span 2;
    }
    @media (max-width: 520px) {
      .ancho {
        grid-column: auto;
      }
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .lineas td {
      padding: 0.3rem 0.4rem;
      vertical-align: middle;
    }
    .escaner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.75rem;
      margin-bottom: 0.75rem;
      font-size: 0.85rem;
    }
    .escaner label {
      font-weight: 600;
    }
    .escaner input {
      min-width: 240px;
      padding: 0.4rem 0.6rem;
      border: 2px solid var(--pp-celeste-medio);
      border-radius: 8px;
      font: 0.95rem var(--pp-fuente);
    }
    .aviso-escaner {
      color: var(--pp-error);
    }
    .opciones-escaner {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      align-items: center;
      width: 100%;
    }
    .col-producto {
      min-width: 260px;
    }
    .lineas select,
    .lineas input,
    .iva {
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 0.9rem var(--pp-fuente);
    }
    .lineas .buscador {
      width: 100%;
      text-align: left;
    }
    .no-registrado {
      display: block;
      margin-top: 0.15rem;
      font-size: 0.75rem;
      color: var(--pp-alerta);
    }
    .nota.izq {
      text-align: left;
    }
    .lineas input,
    .iva {
      width: 7.5rem;
      text-align: right;
    }
    .unidad {
      display: inline-block;
      width: 2rem;
      margin-left: 0.25rem;
      font-size: 0.8rem;
      color: var(--pp-texto-suave);
      text-align: left;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .derecha {
      text-align: right;
    }
    .agregar {
      margin-top: 0.5rem;
    }
    .totales {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.35rem;
      margin-top: 0.75rem;
    }
    .totales > div {
      display: flex;
      align-items: center;
      gap: 1rem;
      min-width: 320px;
      justify-content: space-between;
    }
    .totales .total strong {
      font-size: 1.3rem;
      color: var(--pp-celeste-oscuro);
    }
    .auto {
      margin-left: 0.5rem;
      font-size: 0.78rem;
      color: var(--pp-texto-suave);
    }
    .nota {
      font-size: 0.82rem;
      margin: 0.5rem 0 0;
      text-align: right;
    }
    .archivo {
      margin: 0.5rem 0 0;
      font-weight: 600;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .acciones a {
      text-decoration: none;
    }
  `,
})
export class FacturaNuevaComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly hoy = hoyISO();
  protected readonly maxMb = MAX_MB;
  protected readonly proveedores = signal<Proveedor[]>([]);
  protected readonly productos = signal<Producto[]>([]);
  protected readonly codigoEscaneado = signal('');
  protected readonly avisoEscaner = signal<string | null>(null);
  protected readonly opcionesEscaner = signal<Producto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly proveedorId = signal<number | null>(null);
  protected readonly numero = signal('');
  protected readonly fecha = signal(hoyISO());
  protected readonly observacion = signal('');
  private clave = 1;
  protected readonly lineas = signal<LineaForm[]>([this.lineaVacia()]);
  protected readonly ivaAuto = signal(true);
  protected readonly ivaManual = signal<number | null>(null);
  protected readonly archivo = signal<File | null>(null);

  protected readonly netoManual = signal<number | null>(null);

  /** Etiqueta de cada producto en el buscador → producto */
  private readonly porEtiqueta = computed(() => new Map(this.productos().map((p) => [this.etiqueta(p), p])));
  /** Líneas con algo escrito */
  protected readonly usadas = computed(() =>
    this.lineas().filter((l) => l.texto.trim() !== '' || l.cantidad !== null || l.costoUnitario !== null),
  );
  protected readonly sinLineas = computed(() => this.usadas().length === 0);
  protected readonly neto = computed(() =>
    this.sinLineas() ? Math.round(this.netoManual() ?? 0) : this.lineas().reduce((t, l) => t + this.subtotal(l), 0),
  );
  protected readonly iva = computed(() =>
    this.ivaAuto() ? Math.round(this.neto() * TASA_IVA) : Math.round(this.ivaManual() ?? 0),
  );
  protected readonly total = computed(() => this.neto() + this.iva());

  constructor() {
    let pendientes = 2;
    const listo = () => {
      if (--pendientes === 0) this.cargando.set(false);
    };
    this.api.proveedores().subscribe({ next: (p) => this.proveedores.set(p), complete: listo, error: listo });
    this.api.productos().subscribe({ next: (p) => this.productos.set(p), complete: listo, error: listo });
  }

  protected numOrNull(v: string): number | null {
    return v === '' || v === null || v === undefined ? null : Number(v);
  }

  protected subtotal(l: LineaForm): number {
    return l.cantidad && l.costoUnitario ? Math.round(l.cantidad * l.costoUnitario) : 0;
  }

  protected etiqueta(p: Producto): string {
    return `${p.plu} · ${p.nombre}`;
  }

  /** Buscador de producto: si coincide con uno del catálogo queda elegido; si no, es un producto no registrado */
  escribirProducto(i: number, texto: string): void {
    const p = this.porEtiqueta().get(texto.trim()) ?? null;
    this.lineas.update((ls) => ls.map((l, j) => (j === i ? { ...l, texto, productoId: p?.id ?? null } : l)));
  }

  protected unidadDe(l: LineaForm): string | null {
    return this.productos().find((p) => p.id === l.productoId)?.unidad ?? null;
  }

  actualizar(i: number, campo: 'cantidad' | 'costoUnitario', valor: string): void {
    this.lineas.update((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: this.numOrNull(valor) } : l)));
  }

  /** Enter en el costo de la última línea agrega una nueva */
  enterEnCosto(i: number, evento: Event): void {
    evento.preventDefault();
    if (i === this.lineas().length - 1) this.agregarLinea();
  }

  /** Lector de código de barras (o PLU escrito): agrega el producto como nueva línea */
  escanear(evento: Event): void {
    evento.preventDefault();
    this.avisoEscaner.set(null);
    this.opcionesEscaner.set([]);
    const texto = this.codigoEscaneado().trim();
    if (!texto) return;
    const encontrados = buscarPorCodigo<Producto>(this.productos(), texto);
    if (encontrados.length === 0) {
      this.avisoEscaner.set(`No hay ningún producto con el código "${texto}".`);
      return;
    }
    if (encontrados.length > 1) {
      this.opcionesEscaner.set(encontrados);
      return;
    }
    this.agregarProducto(encontrados[0].id);
  }

  agregarProducto(productoId: number): void {
    this.opcionesEscaner.set([]);
    this.codigoEscaneado.set('');
    const p = this.productos().find((x) => x.id === productoId);
    const texto = p ? this.etiqueta(p) : '';
    const ls = this.lineas();
    const ultima = ls[ls.length - 1];
    // Reutiliza la última línea si está vacía
    if (ultima && !ultima.texto.trim() && ultima.cantidad === null && ultima.costoUnitario === null) {
      this.lineas.update((xs) => xs.map((l, j) => (j === xs.length - 1 ? { ...l, texto, productoId } : l)));
    } else {
      this.lineas.update((xs) => [...xs, { ...this.lineaVacia(), texto, productoId }]);
    }
    // Lleva el cursor a la cantidad de esa línea
    setTimeout(() => {
      const cantidades = document.querySelectorAll<HTMLInputElement>('input[data-cantidad]');
      cantidades[cantidades.length - 1]?.focus();
    });
  }

  agregarLinea(): void {
    this.lineas.update((ls) => [...ls, this.lineaVacia()]);
  }

  quitar(i: number): void {
    this.lineas.update((ls) => ls.filter((_, j) => j !== i));
  }

  elegirArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    if (f && f.size > MAX_MB * 1024 * 1024) {
      this.error.set(`El archivo pesa más de ${MAX_MB} MB. Saque una foto con menor resolución o comprima el PDF.`);
      input.value = '';
      this.archivo.set(null);
      return;
    }
    this.error.set(null);
    this.archivo.set(f);
  }

  guardar(): void {
    const problema = this.validar();
    if (problema) {
      this.error.set(problema);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const datos: NuevaFactura = {
      proveedorId: this.proveedorId()!,
      numero: this.numero().trim(),
      fecha: this.fecha(),
      ...(this.sinLineas() ? { neto: this.neto() } : {}),
      iva: this.iva(),
      observacion: this.observacion().trim() || null,
      lineas: this.usadas().map((l) => ({
        productoId: l.productoId,
        descripcion: l.productoId ? null : l.texto.trim(),
        cantidad: l.cantidad!,
        costoUnitario: l.costoUnitario!,
      })),
    };

    this.guardando.set(true);
    this.error.set(null);
    this.api.crearFactura(datos, this.archivo()!).subscribe({
      next: (f) => this.irA(f.id, null),
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  private irA(id: number, aviso: string | null): void {
    this.guardando.set(false);
    void this.router.navigate(['/meson/facturas', id], { state: { aviso, nueva: true } });
  }

  private validar(): string | null {
    if (!this.proveedorId()) return 'Seleccione el proveedor.';
    if (!this.numero().trim()) return 'Ingrese el N° de la factura.';
    if (!this.fecha()) return 'Ingrese la fecha de emisión.';
    if (this.fecha() > this.hoy) return 'La fecha de la factura no puede ser futura.';
    if (!this.archivo()) return 'Adjunte la foto o PDF de la factura (es obligatoria).';
    for (const [i, l] of this.usadas().entries()) {
      if (!l.texto.trim()) return `Línea ${i + 1}: escriba o elija el producto.`;
      if (!l.cantidad || l.cantidad <= 0) return `Línea ${i + 1}: la cantidad debe ser mayor que 0.`;
      if (l.costoUnitario === null || l.costoUnitario < 0) return `Línea ${i + 1}: ingrese el costo unitario.`;
      if (this.unidadDe(l) === 'UNIDAD' && !Number.isInteger(l.cantidad)) {
        return `Línea ${i + 1}: ese producto se vende por unidad; la cantidad debe ser entera.`;
      }
    }
    if (!this.ivaAuto() && (this.ivaManual() === null || this.ivaManual()! < 0)) return 'Ingrese el IVA de la factura.';
    return null;
  }

  private lineaVacia(): LineaForm {
    return { clave: this.clave++, texto: '', productoId: null, cantidad: null, costoUnitario: null };
  }
}
