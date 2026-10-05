import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CampoMapeo, Mapeo, Planilla, aNumero, aTexto, adivinarMapeo, detectarFilaTitulos, leerPlanilla } from '../../core/excel';
import { mensajeError } from '../../core/errores';
import {
  CategoriaProducto,
  FilaProductoArchivo,
  NOMBRE_CATEGORIA,
  NOMBRE_UNIDAD,
  ResultadoImportacionProductos,
  UnidadMedida,
} from '../../core/models';
import { MapeoColumnasComponent } from '../../shared/mapeo-columnas.component';
import { MesonService } from './meson.service';

const CAMPOS: CampoMapeo[] = [
  { clave: 'plu', etiqueta: 'Código PLU', requerido: true, sinonimos: ['plu', 'plu no', 'n plu', 'codigo plu', 'codigo', 'cod', 'item', 'numero'] },
  { clave: 'nombre', etiqueta: 'Nombre', requerido: true, sinonimos: ['nombre', 'descripcion', 'producto', 'articulo', 'name', 'item name', 'detalle'] },
  { clave: 'precio', etiqueta: 'Precio de venta', requerido: true, sinonimos: ['precio venta', 'precio', 'valor', 'price', 'unit price', 'p venta'] },
  {
    clave: 'unidad',
    etiqueta: 'Unidad (kg / unidad)',
    ayuda: 'Si no viene, se usa la unidad por defecto.',
    sinonimos: ['unidad', 'tipo venta', 'tipo', 'um', 'unit', 'peso conteo', 'peso'],
  },
  {
    clave: 'categoria',
    etiqueta: 'Categoría',
    ayuda: 'Pan, cecinas o mercadería. Si no viene, se usa la categoría por defecto.',
    sinonimos: ['categoria', 'grupo', 'departamento', 'familia', 'seccion', 'dept', 'group'],
  },
];

/** [MESÓN] Cargar el catálogo desde el Excel de las balanzas (crea y actualiza por PLU) */
@Component({
  selector: 'app-productos-importar',
  imports: [RouterLink, CurrencyPipe, MapeoColumnasComponent],
  template: `
    <a routerLink="/meson/productos" class="volver">← Productos</a>
    <header class="encabezado">
      <h1>Importar productos desde Excel</h1>
      <p class="pp-texto-suave">
        Suba el Excel con los productos de las balanzas. Se busca cada producto por su <strong>PLU</strong>: si no existe se crea,
        y si existe se actualizan su nombre, precio, unidad y categoría. El stock no se modifica.
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <h2>1. Archivo</h2>
      <input type="file" accept=".xlsx,.xls,.csv" (change)="elegir($event)" [disabled]="trabajando()" />
      @if (planilla(); as p) {
        <div class="opciones">
          @if (p.hojas.length > 1) {
            <label>Hoja
              <select (change)="cambiarHoja($any($event.target).value)">
                @for (h of p.hojas; track h) {
                  <option [value]="h" [selected]="h === p.hoja">{{ h }}</option>
                }
              </select>
            </label>
          }
          <label>Fila de títulos
            <input type="number" min="1" [max]="p.filas.length" [value]="filaTitulos() + 1" (change)="cambiarFilaTitulos($any($event.target).value)" />
          </label>
          <span class="pp-texto-suave">{{ datos().length }} filas de datos en "{{ p.hoja }}"</span>
        </div>
      }
    </section>

    @if (planilla()) {
      <section class="pp-card">
        <h2>2. ¿Qué columna es cada dato?</h2>
        <app-mapeo-columnas [campos]="campos" [titulos]="titulos()" [datos]="datos()" [(mapeo)]="mapeo" />
        <div class="opciones">
          <label>Categoría por defecto
            <select (change)="categoriaDefecto.set($any($event.target).value)">
              @for (c of categorias; track c) {
                <option [value]="c" [selected]="c === categoriaDefecto()">{{ nombreCategoria[c] }}</option>
              }
            </select>
          </label>
          <label>Unidad por defecto
            <select (change)="unidadDefecto.set($any($event.target).value)">
              @for (u of unidades; track u) {
                <option [value]="u" [selected]="u === unidadDefecto()">{{ nombreUnidad[u] }}</option>
              }
            </select>
          </label>
          <button type="button" class="pp-btn" [disabled]="trabajando() || !mapeoCompleto()" (click)="enviar(true)">
            {{ trabajando() ? 'Revisando…' : 'Revisar' }}
          </button>
          @if (!mapeoCompleto()) {
            <span class="pp-texto-suave">Indique al menos PLU, nombre y precio.</span>
          }
        </div>
      </section>
    }

    @if (resultado(); as r) {
      <section class="pp-card">
        <h2>3. {{ r.guardado ? 'Importación terminada' : 'Revise antes de confirmar' }}</h2>
        <div class="resumen">
          <span class="nuevo"><strong>{{ r.nuevos.length }}</strong> nuevos</span>
          <span class="cambio"><strong>{{ r.actualizados.length }}</strong> con cambios</span>
          <span><strong>{{ r.sinCambios }}</strong> sin cambios</span>
          <span class="error"><strong>{{ r.errores.length }}</strong> filas con error (no se importan)</span>
        </div>

        @if (r.guardado) {
          <p class="pp-aviso-ok">Catálogo actualizado. <a routerLink="/meson/productos">Ver productos</a></p>
        } @else if (r.nuevos.length + r.actualizados.length > 0) {
          <button type="button" class="pp-btn" [disabled]="trabajando()" (click)="enviar(false)">
            {{ trabajando() ? 'Importando…' : 'Confirmar e importar ' + (r.nuevos.length + r.actualizados.length) + ' producto(s)' }}
          </button>
        } @else {
          <p class="pp-texto-suave">No hay nada nuevo que importar.</p>
        }

        @if (r.errores.length) {
          <details open>
            <summary>Filas con error</summary>
            <ul class="lista">
              @for (e of r.errores.slice(0, 100); track $index) {
                <li>Fila {{ e.fila }}: {{ e.mensaje }}</li>
              }
            </ul>
          </details>
        }
        @if (r.actualizados.length) {
          <details>
            <summary>Productos que cambian ({{ r.actualizados.length }})</summary>
            <ul class="lista">
              @for (a of r.actualizados.slice(0, 300); track a.plu) {
                <li><strong>{{ a.plu }} · {{ a.nombre }}</strong>: {{ a.cambios.join('; ') }}</li>
              }
            </ul>
          </details>
        }
        @if (r.nuevos.length) {
          <details>
            <summary>Productos nuevos ({{ r.nuevos.length }})</summary>
            <div class="tabla-scroll">
              <table class="pp-tabla">
                <thead><tr><th>PLU</th><th>Nombre</th><th class="num">Precio</th><th>Unidad</th><th>Categoría</th></tr></thead>
                <tbody>
                  @for (n of r.nuevos.slice(0, 300); track n.plu) {
                    <tr>
                      <td><code>{{ n.plu }}</code></td>
                      <td>{{ n.nombre }}</td>
                      <td class="num">{{ n.precio | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                      <td>{{ nombreUnidad[n.unidad] }}</td>
                      <td>{{ nombreCategoria[n.categoria] }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }
      </section>
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
    .opciones {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem 1.25rem;
      margin-top: 0.75rem;
    }
    .opciones label {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .opciones select,
    .opciones input {
      min-height: 36px;
      padding: 0.25rem 0.45rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.88rem var(--pp-fuente);
    }
    .opciones input[type='number'] {
      width: 6rem;
    }
    .resumen {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 0.75rem;
    }
    .nuevo strong {
      color: var(--pp-exito);
    }
    .cambio strong {
      color: var(--pp-celeste-oscuro);
    }
    .error strong {
      color: var(--pp-error);
    }
    details {
      margin-top: 0.75rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .lista {
      max-height: 260px;
      overflow: auto;
      font-size: 0.85rem;
    }
    .tabla-scroll {
      overflow: auto;
      max-height: 320px;
    }
    .num {
      text-align: right;
    }
  `,
})
export class ProductosImportarComponent {
  private readonly api = inject(MesonService);

  protected readonly campos = CAMPOS;
  protected readonly categorias = Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[];
  protected readonly unidades = Object.keys(NOMBRE_UNIDAD) as UnidadMedida[];
  protected readonly nombreCategoria = NOMBRE_CATEGORIA;
  protected readonly nombreUnidad = NOMBRE_UNIDAD;

  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly filaTitulos = signal(0);
  protected readonly mapeo = signal<Mapeo>({});
  protected readonly categoriaDefecto = signal<CategoriaProducto>('PAN');
  protected readonly unidadDefecto = signal<UnidadMedida>('UNIDAD');
  protected readonly resultado = signal<ResultadoImportacionProductos | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  private archivo: File | null = null;

  protected readonly titulos = computed(() => this.planilla()?.filas[this.filaTitulos()] ?? []);
  protected readonly datos = computed(() => (this.planilla()?.filas ?? []).slice(this.filaTitulos() + 1));
  protected readonly mapeoCompleto = computed(() =>
    CAMPOS.filter((c) => c.requerido).every((c) => this.mapeo()[c.clave] !== null && this.mapeo()[c.clave] !== undefined),
  );

  async elegir(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.archivo = archivo;
    await this.leer();
  }

  async cambiarHoja(hoja: string): Promise<void> {
    await this.leer(hoja);
  }

  cambiarFilaTitulos(valor: string): void {
    const n = Math.max(1, Math.min(Number(valor) || 1, this.planilla()?.filas.length ?? 1));
    this.filaTitulos.set(n - 1);
    this.mapeo.set(adivinarMapeo(this.titulos(), CAMPOS));
    this.resultado.set(null);
  }

  private async leer(hoja?: string): Promise<void> {
    if (!this.archivo) return;
    this.error.set(null);
    this.resultado.set(null);
    this.trabajando.set(true);
    try {
      const p = await leerPlanilla(this.archivo, hoja);
      this.planilla.set(p);
      this.filaTitulos.set(detectarFilaTitulos(p.filas));
      this.mapeo.set(adivinarMapeo(this.titulos(), CAMPOS));
    } catch (e) {
      this.planilla.set(null);
      this.error.set(e instanceof Error ? e.message : 'No se pudo leer el archivo. ¿Es un Excel o CSV?');
    } finally {
      this.trabajando.set(false);
    }
  }

  enviar(simular: boolean): void {
    const m = this.mapeo();
    const col = (fila: (string | number | null)[], clave: string) => {
      const i = m[clave];
      return i === null || i === undefined ? null : (fila[i] ?? null);
    };
    const base = this.filaTitulos() + 2; // N° de fila como lo ve el usuario en Excel
    const filas: FilaProductoArchivo[] = this.datos().map((f, i) => ({
      fila: base + i,
      plu: aTexto(col(f, 'plu'))?.slice(0, 50) ?? null,
      nombre: aTexto(col(f, 'nombre'))?.slice(0, 200) ?? null,
      precioVenta: aNumero(col(f, 'precio')),
      unidad: aTexto(col(f, 'unidad'))?.slice(0, 30) ?? null,
      categoria: aTexto(col(f, 'categoria'))?.slice(0, 50) ?? null,
    }));
    if (!simular && !confirm('¿Importar los productos? Se crearán los nuevos y se actualizarán los que cambiaron.')) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.api
      .importarProductos({
        filas,
        categoriaPorDefecto: this.categoriaDefecto(),
        unidadPorDefecto: this.unidadDefecto(),
        simular,
        nombreArchivo: this.archivo?.name ?? 'archivo',
      })
      .subscribe({
        next: (r) => {
          this.resultado.set(r);
          this.trabajando.set(false);
        },
        error: (e) => {
          this.error.set(mensajeError(e, 'No se pudo procesar el archivo.'));
          this.trabajando.set(false);
        },
      });
  }
}
