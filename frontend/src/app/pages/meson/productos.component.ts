import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { descargarExcel } from '../../core/excel';
import { mensajeError } from '../../core/errores';
import {
  CategoriaProducto,
  NOMBRE_CATEGORIA,
  NOMBRE_UNIDAD,
  Producto,
  ProductoForm,
  UnidadMedida,
} from '../../core/models';
import { MesonService } from './meson.service';

type Edicion = { tipo: 'nuevo' } | { tipo: 'editar'; producto: Producto };

/** [MESÓN] Catálogo de productos (pan, cecinas y mercadería) con el PLU de la balanza */
@Component({
  selector: 'app-productos',
  imports: [ReactiveFormsModule, CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Productos</h1>
        <p class="pp-texto-suave">
          El código PLU debe ser el mismo que tiene el producto en la balanza, para cruzar ventas y stock.
        </p>
      </div>
      <div class="acciones-cabecera">
        <a routerLink="/meson/productos/importar" class="pp-btn pp-btn--secundario">Importar desde Excel</a>
        <button type="button" class="pp-btn pp-btn--secundario" (click)="exportarBalanza()" title="Excel con PLU, nombre, precio y unidad para cargar en las balanzas">
          Exportar para balanzas
        </button>
        <button type="button" class="pp-btn" (click)="abrirNuevo()">+ Nuevo producto</button>
      </div>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (edicion(); as ed) {
      <section class="pp-card formulario">
        <h2>{{ ed.tipo === 'nuevo' ? 'Nuevo producto' : 'Editar: ' + ed.producto.nombre }}</h2>
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="grilla-form">
            <div class="pp-campo">
              <label for="plu">Código PLU *</label>
              <input id="plu" formControlName="plu" maxlength="20" placeholder="Ej. 1001" />
            </div>
            <div class="pp-campo ancho">
              <label for="nombre">Nombre *</label>
              <input id="nombre" formControlName="nombre" maxlength="120" placeholder="Ej. Jamón pierna" />
            </div>
            <div class="pp-campo">
              <label for="categoria">Categoría *</label>
              <select id="categoria" formControlName="categoria">
                @for (c of categorias; track c) {
                  <option [value]="c">{{ nombreCategoria[c] }}</option>
                }
              </select>
            </div>
            <div class="pp-campo">
              <label for="unidad">Se vende por *</label>
              <select id="unidad" formControlName="unidad">
                @for (u of unidades; track u) {
                  <option [value]="u">{{ nombreUnidad[u] }}</option>
                }
              </select>
            </div>
            <div class="pp-campo">
              <label for="precio">Precio de venta ($ por {{ form.controls.unidad.value === 'KG' ? 'kg' : 'unidad' }}) *</label>
              <input id="precio" type="number" min="0" step="10" formControlName="precioVenta" />
            </div>
            <div class="pp-campo">
              <label for="minimo">Stock mínimo ({{ form.controls.unidad.value === 'KG' ? 'kg' : 'unidades' }})</label>
              <input id="minimo" type="number" min="0" step="0.5" formControlName="stockMinimo" />
            </div>
          </div>
          @if (ed.tipo === 'editar') {
            <p class="pp-texto-suave nota">
              Stock actual: <strong>{{ num(ed.producto.stockActual) | number: '1.0-3' }}</strong>.
              El stock no se edita aquí: cambia con facturas, ventas de balanza y ajustes de inventario.
            </p>
          }
          <div class="acciones">
            <button type="button" class="pp-btn pp-btn--secundario" (click)="edicion.set(null)">Cancelar</button>
            <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </section>
    }

    <section class="pp-card">
      <div class="filtros">
        <input type="search" placeholder="Buscar por nombre o PLU…" (input)="busqueda.set($any($event.target).value)" aria-label="Buscar producto" />
        <div class="chips" role="group" aria-label="Filtrar por categoría">
          <button type="button" class="chip" [class.activo]="categoria() === null" (click)="categoria.set(null)">Todas</button>
          @for (c of categorias; track c) {
            <button type="button" class="chip" [class.activo]="categoria() === c" (click)="categoria.set(c)">
              {{ nombreCategoria[c] }} <small>{{ conteo()[c] }}</small>
            </button>
          }
        </div>
        <label class="check">
          <input type="checkbox" (change)="mostrarInactivos.set($any($event.target).checked)" /> Mostrar desactivados
        </label>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="exportar()">Exportar Excel (CSV)</button>
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>PLU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Unidad</th>
              <th class="num">Precio venta</th>
              <th class="num">Stock</th>
              <th class="num">Mínimo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of visibles(); track p.id) {
              <tr [class.inactivo]="!p.activo">
                <td><code>{{ p.plu }}</code></td>
                <td>
                  <strong>{{ p.nombre }}</strong>
                  @if (!p.activo) {
                    <span class="pp-chip gris">desactivado</span>
                  }
                </td>
                <td>{{ nombreCategoria[p.categoria] }}</td>
                <td>{{ nombreUnidad[p.unidad] }}</td>
                <td class="num">{{ num(p.precioVenta) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="num" [class.bajo]="stockBajo(p)" [title]="stockBajo(p) ? 'Bajo el mínimo' : ''">
                  {{ num(p.stockActual) | number: '1.0-3' }}
                </td>
                <td class="num">{{ num(p.stockMinimo) | number: '1.0-3' }}</td>
                <td class="botones">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="abrirEditar(p)">Editar</button>
                  @if (p.activo) {
                    <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="desactivar(p)">Desactivar</button>
                  } @else {
                    <button type="button" class="pp-btn pp-btn--chico" (click)="reactivar(p)">Reactivar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="pp-texto-suave">
                  {{ cargando() ? 'Cargando…' : productos().length === 0 ? 'Aún no hay productos. Cree el primero con "+ Nuevo producto".' : 'Ningún producto coincide con el filtro.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .acciones-cabecera {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .acciones-cabecera a {
      text-decoration: none;
    }
    .formulario {
      margin-bottom: 1.25rem;
      border-left: 5px solid var(--pp-celeste);
    }
    .formulario h2 {
      font-size: 1.1rem;
    }
    .grilla-form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
    .nota {
      font-size: 0.85rem;
      margin: 0 0 0.75rem;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 1rem;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .filtros input[type='search'] {
      min-height: 36px;
      min-width: 220px;
      padding: 0.3rem 0.6rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
    }
    .chips {
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
    }
    .chip {
      padding: 0.3rem 0.75rem;
      border: 1px solid var(--pp-borde);
      border-radius: 999px;
      background: var(--pp-blanco);
      font: 600 0.85rem var(--pp-fuente);
      color: var(--pp-texto-suave);
      cursor: pointer;
    }
    .chip small {
      font-weight: 400;
      opacity: 0.8;
    }
    .chip.activo {
      background: var(--pp-celeste);
      border-color: var(--pp-celeste);
      color: #fff;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.88rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .bajo {
      color: var(--pp-error);
      font-weight: 700;
    }
    .botones {
      white-space: nowrap;
      text-align: right;
    }
    .botones button + button {
      margin-left: 0.35rem;
    }
    tr.inactivo td {
      color: var(--pp-texto-suave);
    }
    .gris {
      background: #eee;
      color: var(--pp-texto-suave);
      margin-left: 0.35rem;
    }
  `,
})
export class ProductosComponent {
  private readonly api = inject(MesonService);
  private readonly fb = inject(FormBuilder);

  protected readonly categorias = Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[];
  protected readonly unidades = Object.keys(NOMBRE_UNIDAD) as UnidadMedida[];
  protected readonly nombreCategoria = NOMBRE_CATEGORIA;
  protected readonly nombreUnidad = NOMBRE_UNIDAD;

  protected readonly productos = signal<Producto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly edicion = signal<Edicion | null>(null);
  protected readonly busqueda = signal('');
  protected readonly categoria = signal<CategoriaProducto | null>(null);
  protected readonly mostrarInactivos = signal(false);

  protected readonly visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter(
      (p) =>
        (this.mostrarInactivos() || p.activo) &&
        (this.categoria() === null || p.categoria === this.categoria()) &&
        (!q || p.nombre.toLowerCase().includes(q) || p.plu.toLowerCase().startsWith(q)),
    );
  });

  protected readonly conteo = computed(() => {
    const c: Record<CategoriaProducto, number> = { PAN: 0, CECINAS: 0, MERCADERIA: 0 };
    for (const p of this.productos()) if (p.activo) c[p.categoria]++;
    return c;
  });

  protected readonly form = this.fb.nonNullable.group({
    plu: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[0-9A-Za-z-]+$/)]],
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    categoria: this.fb.nonNullable.control<CategoriaProducto>('MERCADERIA'),
    unidad: this.fb.nonNullable.control<UnidadMedida>('UNIDAD'),
    precioVenta: this.fb.nonNullable.control<number | null>(null, [Validators.required, Validators.min(0)]),
    stockMinimo: this.fb.nonNullable.control<number | null>(0, [Validators.min(0)]),
  });

  constructor() {
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  protected stockBajo(p: Producto): boolean {
    return p.activo && this.num(p.stockMinimo) > 0 && this.num(p.stockActual) < this.num(p.stockMinimo);
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.productos({ incluirInactivos: true }).subscribe({
      next: (data) => {
        this.productos.set(data);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los productos.'));
        this.cargando.set(false);
      },
    });
  }

  abrirNuevo(): void {
    this.limpiarAvisos();
    this.form.reset({
      plu: '',
      nombre: '',
      categoria: this.categoria() ?? 'MERCADERIA',
      unidad: 'UNIDAD',
      precioVenta: null,
      stockMinimo: 0,
    });
    this.edicion.set({ tipo: 'nuevo' });
  }

  abrirEditar(p: Producto): void {
    this.limpiarAvisos();
    this.form.reset({
      plu: p.plu,
      nombre: p.nombre,
      categoria: p.categoria,
      unidad: p.unidad,
      precioVenta: this.num(p.precioVenta),
      stockMinimo: this.num(p.stockMinimo),
    });
    this.edicion.set({ tipo: 'editar', producto: p });
  }

  guardar(): void {
    const ed = this.edicion();
    if (!ed) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revise los campos: PLU (solo números, letras o guion), nombre y precio son obligatorios.');
      return;
    }
    const v = this.form.getRawValue();
    const datos: ProductoForm = {
      plu: v.plu.trim().toUpperCase(),
      nombre: v.nombre.trim(),
      categoria: v.categoria,
      unidad: v.unidad,
      precioVenta: Math.round(Number(v.precioVenta)),
      stockMinimo: Number(v.stockMinimo ?? 0),
    };

    this.guardando.set(true);
    this.error.set(null);
    const peticion =
      ed.tipo === 'nuevo' ? this.api.crearProducto(datos) : this.api.actualizarProducto(ed.producto.id, datos);
    peticion.subscribe({
      next: (p) => {
        this.guardando.set(false);
        this.edicion.set(null);
        this.mensaje.set(ed.tipo === 'nuevo' ? `Producto "${p.nombre}" creado.` : `Producto "${p.nombre}" actualizado.`);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  desactivar(p: Producto): void {
    if (!confirm(`¿Desactivar "${p.nombre}"? Se conserva su historial.`)) return;
    this.limpiarAvisos();
    this.api.desactivarProducto(p.id).subscribe({
      next: () => {
        this.mensaje.set(`Producto "${p.nombre}" desactivado.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  reactivar(p: Producto): void {
    this.limpiarAvisos();
    this.api.actualizarProducto(p.id, { activo: true }).subscribe({
      next: () => {
        this.mensaje.set(`Producto "${p.nombre}" reactivado.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  exportar(): void {
    descargarCsv('productos-patopan.csv', [
      ['PLU', 'Nombre', 'Categoría', 'Unidad', 'Precio venta', 'Stock actual', 'Stock mínimo', 'Activo'],
      ...this.visibles().map((p) => [
        p.plu,
        p.nombre,
        this.nombreCategoria[p.categoria],
        this.nombreUnidad[p.unidad],
        this.num(p.precioVenta),
        this.num(p.stockActual),
        this.num(p.stockMinimo),
        p.activo ? 'Sí' : 'No',
      ]),
    ]);
  }

  /** Catálogo activo en Excel, para cargarlo en las balanzas con el software de CAS */
  exportarBalanza(): void {
    const activos = this.productos().filter((p) => p.activo);
    if (activos.length === 0) {
      this.error.set('No hay productos activos para exportar.');
      return;
    }
    void descargarExcel('productos-balanzas-patopan.xlsx', 'PLU', [
      ['PLU', 'Nombre', 'Precio', 'Unidad', 'Categoría'],
      ...activos.map((p) => [p.plu, p.nombre, this.num(p.precioVenta), p.unidad === 'KG' ? 'kg' : 'unidad', this.nombreCategoria[p.categoria]]),
    ]);
  }

  private limpiarAvisos(): void {
    this.error.set(null);
    this.mensaje.set(null);
  }
}
