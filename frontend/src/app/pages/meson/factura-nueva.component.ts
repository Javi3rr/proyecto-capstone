import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { CategoriaProducto, NOMBRE_CATEGORIA, NuevaFactura, Producto, Proveedor } from '../../core/models';
import { hoyISO } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

interface LineaForm {
  clave: number;
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
          Ingrese cada producto con su cantidad y costo unitario <strong>neto</strong> (sin IVA), tal como viene en la factura.
          Al guardar, la mercadería se suma al stock.
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
      <h2>Detalle</h2>
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
                  <select
                    [value]="l.productoId ?? ''"
                    (change)="actualizar(i, 'productoId', $any($event.target).value)"
                    [attr.aria-label]="'Producto línea ' + (i + 1)"
                  >
                    <option value="">Seleccione…</option>
                    @for (g of grupos(); track g.categoria) {
                      <optgroup [label]="g.nombre">
                        @for (p of g.productos; track p.id) {
                          <option [value]="p.id">{{ p.plu }} · {{ p.nombre }}</option>
                        }
                      </optgroup>
                    }
                  </select>
                </td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
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
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="lineas().length === 1" (click)="quitar(i)" title="Quitar línea">✕</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico agregar" (click)="agregarLinea()">+ Agregar línea</button>
      @if (productos().length === 0 && !cargando()) {
        <p class="pp-texto-suave">No hay productos activos. <a routerLink="/meson/productos">Créelos aquí</a> antes de registrar la factura.</p>
      }

      <div class="totales">
        <div><span>Neto</span><strong>{{ neto() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
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
      <p class="pp-texto-suave nota">Compare el total con el de la factura en papel. Si tiene productos exentos, desmarque "19 % automático" e ingrese el IVA.</p>
    </section>

    <section class="pp-card">
      <h2>Foto o PDF de la factura</h2>
      <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" (change)="elegirArchivo($event)" />
      @if (archivo(); as a) {
        <p class="archivo">{{ a.name }} · {{ a.size / 1024 / 1024 | number: '1.1-1' }} MB</p>
      } @else {
        <p class="pp-texto-suave nota">Opcional ahora; también puede adjuntarse después. PDF, JPG, PNG o WEBP, hasta {{ maxMb }} MB.</p>
      }
    </section>

    <div class="acciones">
      <a routerLink="/meson/facturas" class="pp-btn pp-btn--secundario">Cancelar</a>
      <button type="button" class="pp-btn" [disabled]="guardando()" (click)="guardar()">
        {{ guardando() ? 'Guardando…' : 'Registrar factura y sumar al stock' }}
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
    .lineas select {
      width: 100%;
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

  protected readonly grupos = computed(() =>
    (Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[])
      .map((c) => ({ categoria: c, nombre: NOMBRE_CATEGORIA[c], productos: this.productos().filter((p) => p.categoria === c) }))
      .filter((g) => g.productos.length > 0),
  );
  protected readonly neto = computed(() => this.lineas().reduce((t, l) => t + this.subtotal(l), 0));
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

  protected unidadDe(l: LineaForm): string | null {
    return this.productos().find((p) => p.id === l.productoId)?.unidad ?? null;
  }

  actualizar(i: number, campo: 'productoId' | 'cantidad' | 'costoUnitario', valor: string): void {
    this.lineas.update((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: this.numOrNull(valor) } : l)));
  }

  /** Enter en el costo de la última línea agrega una nueva */
  enterEnCosto(i: number, evento: Event): void {
    evento.preventDefault();
    if (i === this.lineas().length - 1) this.agregarLinea();
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
      iva: this.iva(),
      observacion: this.observacion().trim() || null,
      lineas: this.lineas()
        .filter((l) => l.productoId !== null)
        .map((l) => ({ productoId: l.productoId!, cantidad: l.cantidad!, costoUnitario: l.costoUnitario! })),
    };

    this.guardando.set(true);
    this.error.set(null);
    this.api.crearFactura(datos).subscribe({
      next: (f) => {
        const archivo = this.archivo();
        if (!archivo) {
          this.irA(f.id, null);
          return;
        }
        this.api.adjuntarArchivo(f.id, archivo).subscribe({
          next: () => this.irA(f.id, null),
          error: (e) =>
            this.irA(f.id, `La factura se registró, pero el archivo no se pudo subir: ${mensajeError(e)}. Intente adjuntarlo nuevamente.`),
        });
      },
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
    const usadas = this.lineas().filter((l) => l.productoId !== null || l.cantidad !== null || l.costoUnitario !== null);
    if (usadas.length === 0) return 'Agregue al menos un producto.';
    for (const [i, l] of usadas.entries()) {
      if (l.productoId === null) return `Línea ${i + 1}: seleccione el producto.`;
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
    return { clave: this.clave++, productoId: null, cantidad: null, costoUnitario: null };
  }
}
