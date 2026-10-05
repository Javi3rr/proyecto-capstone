import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import { CategoriaProducto, CierreManual, Mesonera, NOMBRE_CATEGORIA, Producto } from '../../core/models';
import { hoyISO } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

interface FilaProducto {
  clave: number;
  productoId: number | null;
  cantidad: number | null;
  monto: number | null;
  /** true si el usuario escribió el monto (no se recalcula) */
  montoManual: boolean;
}

interface FilaMesonera {
  codigo: string;
  nombre: string;
  monto: number | null;
  montoMisc: number | null;
  tickets: number | null;
}

/** [MESÓN] Cierre manual de ventas del día, digitado desde el reporte impreso de la balanza */
@Component({
  selector: 'app-cierre-ventas',
  imports: [CurrencyPipe, RouterLink],
  template: `
    <a routerLink="/meson/ventas" class="volver">← Ventas</a>
    <header class="encabezado">
      <h1>Cierre manual de ventas</h1>
      <p class="pp-texto-suave">
        Copie el reporte de ventas que imprime la balanza (reporte <strong>X</strong>, que no borra los totales).
        Lo vendido de cada producto se descontará del stock.
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <div class="pp-campo fecha">
        <label for="fecha">Fecha de las ventas *</label>
        <input id="fecha" type="date" [max]="hoy" [value]="fecha()" (change)="fecha.set($any($event.target).value)" />
      </div>
    </section>

    <section class="pp-card">
      <h2>Productos vendidos</h2>
      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr><th class="col-prod">Producto</th><th class="num">Cantidad / kg</th><th class="num">Monto ($)</th><th></th></tr>
          </thead>
          <tbody>
            @for (f of filas(); track f.clave; let i = $index) {
              <tr>
                <td>
                  <select (change)="actualizar(i, 'productoId', $any($event.target).value)" [attr.aria-label]="'Producto ' + (i + 1)">
                    <option value="" [selected]="f.productoId === null">Seleccione…</option>
                    @for (g of grupos(); track g.categoria) {
                      <optgroup [label]="g.nombre">
                        @for (p of g.productos; track p.id) {
                          <option [value]="p.id" [selected]="f.productoId === p.id">{{ p.plu }} · {{ p.nombre }}</option>
                        }
                      </optgroup>
                    }
                  </select>
                </td>
                <td class="num">
                  <input type="number" min="0" step="0.001" [value]="f.cantidad ?? ''" (input)="actualizar(i, 'cantidad', $any($event.target).value)" />
                </td>
                <td class="num">
                  <input type="number" min="0" step="1" [value]="f.monto ?? ''" (input)="actualizar(i, 'monto', $any($event.target).value)"
                    (keydown.enter)="enterEnMonto(i, $event)" />
                </td>
                <td class="derecha">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="quitar(i)" title="Quitar">✕</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico agregar" (click)="agregar()">+ Agregar producto</button>
      <p class="pp-texto-suave nota">El monto se calcula con el precio del catálogo; si el reporte dice otra cifra, corríjala.</p>
    </section>

    <section class="pp-card">
      <h2>Por mesonera</h2>
      @if (mesoneras().length === 0) {
        <p class="pp-texto-suave">
          No hay mesoneras con código. El administrador puede asignarlos en Administración &gt; Usuarios (código = número V1–V4 de la balanza).
          Mientras tanto, ingrese solo el total "Misc." del día:
        </p>
        <div class="pp-campo corto">
          <label for="misc">Total "Misc. Por Conteo" del día ($)</label>
          <input id="misc" type="number" min="0" step="1" [value]="miscTotal() ?? ''" (input)="miscTotal.set(num($any($event.target).value))" />
        </div>
      } @else {
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr><th>Mesonera</th><th class="num">Total vendido ($)</th><th class="num">"Misc." ($)</th><th class="num">N° de tickets</th></tr>
            </thead>
            <tbody>
              @for (m of filasMesoneras(); track m.codigo; let i = $index) {
                <tr>
                  <td><strong>V{{ m.codigo }}</strong> · {{ m.nombre }}</td>
                  <td class="num"><input type="number" min="0" step="1" [value]="m.monto ?? ''" (input)="actualizarMesonera(i, 'monto', $any($event.target).value)" /></td>
                  <td class="num"><input type="number" min="0" step="1" [value]="m.montoMisc ?? ''" (input)="actualizarMesonera(i, 'montoMisc', $any($event.target).value)" /></td>
                  <td class="num"><input type="number" min="0" step="1" [value]="m.tickets ?? ''" (input)="actualizarMesonera(i, 'tickets', $any($event.target).value)" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="pp-texto-suave nota">Deje en blanco a las mesoneras que no trabajaron ese día.</p>
      }
    </section>

    <section class="pp-card pie">
      <div class="totales">
        <span>Productos: <strong>{{ totalProductos() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>"Misc.": <strong>{{ totalMisc() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>Total: <strong>{{ totalProductos() + totalMisc() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        @if (totalMesoneras() > 0) {
          <span [class.difiere]="totalMesoneras() !== totalProductos() + totalMisc()">
            Según mesoneras: <strong>{{ totalMesoneras() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
          </span>
        }
      </div>
      <div class="pp-campo">
        <label for="obs">Observación</label>
        <input id="obs" maxlength="255" placeholder="Opcional" [value]="observacion()" (input)="observacion.set($any($event.target).value)" />
      </div>
      <div class="acciones">
        <a routerLink="/meson/ventas" class="pp-btn pp-btn--secundario">Cancelar</a>
        <button type="button" class="pp-btn" [disabled]="guardando()" (click)="guardar()">
          {{ guardando() ? 'Guardando…' : 'Guardar cierre y descontar stock' }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .volver {
      display: inline-block;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.5rem;
    }
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    section.pp-card {
      margin-bottom: 1rem;
    }
    h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .fecha,
    .corto {
      max-width: 260px;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla td {
      padding: 0.3rem 0.4rem;
      vertical-align: middle;
    }
    .col-prod {
      min-width: 260px;
    }
    td select,
    td input {
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 0.9rem var(--pp-fuente);
    }
    td select {
      width: 100%;
    }
    td input {
      width: 7.5rem;
      text-align: right;
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
    .nota {
      font-size: 0.82rem;
      margin: 0.5rem 0 0;
    }
    .pie {
      position: sticky;
      bottom: 0;
      box-shadow: 0 -4px 12px rgba(15, 111, 174, 0.08);
    }
    .totales {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .difiere strong {
      color: var(--pp-alerta);
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
export class CierreVentasComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly hoy = hoyISO();
  protected readonly fecha = signal(hoyISO());
  protected readonly productos = signal<Producto[]>([]);
  protected readonly mesoneras = signal<Mesonera[]>([]);
  private clave = 1;
  protected readonly filas = signal<FilaProducto[]>([this.filaVacia()]);
  protected readonly filasMesoneras = signal<FilaMesonera[]>([]);
  protected readonly miscTotal = signal<number | null>(null);
  protected readonly observacion = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly grupos = computed(() =>
    (Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[])
      .map((c) => ({ categoria: c, nombre: NOMBRE_CATEGORIA[c], productos: this.productos().filter((p) => p.categoria === c) }))
      .filter((g) => g.productos.length > 0),
  );
  protected readonly totalProductos = computed(() => this.filas().reduce((t, f) => t + (f.productoId ? (f.monto ?? 0) : 0), 0));
  protected readonly totalMisc = computed(() =>
    this.mesoneras().length ? this.filasMesoneras().reduce((t, m) => t + (m.montoMisc ?? 0), 0) : (this.miscTotal() ?? 0),
  );
  protected readonly totalMesoneras = computed(() => this.filasMesoneras().reduce((t, m) => t + (m.monto ?? 0), 0));

  constructor() {
    this.api.productos().subscribe({ next: (p) => this.productos.set(p) });
    this.api.mesoneras().subscribe({
      next: (ms) => {
        const activas = ms.filter((m) => m.activo);
        this.mesoneras.set(activas);
        this.filasMesoneras.set(activas.map((m) => ({ codigo: m.codigo, nombre: m.nombre, monto: null, montoMisc: null, tickets: null })));
      },
    });
  }

  protected num(v: string): number | null {
    return v === '' ? null : Number(v);
  }

  actualizar(i: number, campo: 'productoId' | 'cantidad' | 'monto', valor: string): void {
    this.filas.update((fs) =>
      fs.map((f, j) => {
        if (j !== i) return f;
        const n = this.num(valor);
        const nueva: FilaProducto = { ...f, [campo]: n, montoManual: campo === 'monto' ? n !== null : f.montoManual };
        // Calcula el monto con el precio del catálogo mientras el usuario no lo haya escrito
        if (campo !== 'monto' && !nueva.montoManual) {
          const p = this.productos().find((x) => x.id === nueva.productoId);
          nueva.monto = p && nueva.cantidad ? Math.round(nueva.cantidad * Number(p.precioVenta)) : null;
        }
        return nueva;
      }),
    );
  }

  actualizarMesonera(i: number, campo: 'monto' | 'montoMisc' | 'tickets', valor: string): void {
    this.filasMesoneras.update((ms) => ms.map((m, j) => (j === i ? { ...m, [campo]: this.num(valor) } : m)));
  }

  enterEnMonto(i: number, evento: Event): void {
    evento.preventDefault();
    if (i === this.filas().length - 1) this.agregar();
  }

  agregar(): void {
    this.filas.update((fs) => [...fs, this.filaVacia()]);
  }

  quitar(i: number): void {
    this.filas.update((fs) => (fs.length === 1 ? [this.filaVacia()] : fs.filter((_, j) => j !== i)));
  }

  guardar(): void {
    this.error.set(null);
    if (!this.fecha() || this.fecha() > this.hoy) return this.error.set('Indique una fecha válida (no futura).');

    const usadas = this.filas().filter((f) => f.productoId !== null || f.cantidad !== null || f.monto !== null);
    for (const [i, f] of usadas.entries()) {
      if (f.productoId === null) return this.error.set(`Producto ${i + 1}: seleccione el producto.`);
      if (!f.cantidad || f.cantidad <= 0) return this.error.set(`Producto ${i + 1}: la cantidad debe ser mayor que 0.`);
      if (f.monto === null || f.monto < 0 || !Number.isInteger(f.monto)) return this.error.set(`Producto ${i + 1}: monto inválido (pesos enteros).`);
    }
    const mesoneras = this.filasMesoneras()
      .filter((m) => m.monto !== null || m.montoMisc !== null || m.tickets !== null)
      .map((m) => ({ codigo: m.codigo, monto: m.monto ?? 0, montoMisc: m.montoMisc ?? 0, tickets: m.tickets }));
    if (mesoneras.some((m) => m.montoMisc > m.monto)) return this.error.set('El "Misc." de una mesonera no puede ser mayor que su total vendido.');
    if (usadas.length === 0 && this.totalMisc() === 0) return this.error.set('Ingrese al menos un producto vendido o el total "Misc.".');

    const datos: CierreManual = {
      fecha: this.fecha(),
      lineas: usadas.map((f) => ({ productoId: f.productoId!, cantidad: f.cantidad!, monto: f.monto! })),
      mesoneras,
      montoMisc: this.mesoneras().length ? undefined : (this.miscTotal() ?? 0),
      observacion: this.observacion().trim() || null,
    };
    if (!confirm(`¿Guardar el cierre del ${this.fecha().split('-').reverse().join('-')}? Se descontará del stock lo vendido.`)) return;

    this.guardando.set(true);
    this.api.cierreManual(datos).subscribe({
      next: (r) => void this.router.navigate(['/meson/ventas', r.importacionId], { state: { nueva: true, diferencia: r.diferencia } }),
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  private filaVacia(): FilaProducto {
    return { clave: this.clave++, productoId: null, cantidad: null, monto: null, montoManual: false };
  }
}
