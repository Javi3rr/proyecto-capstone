import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { coincideBarras } from '../../core/barras';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { CategoriaProducto, EstadoStock, FilaStock, NOMBRE_CATEGORIA, Stock } from '../../core/models';
import { hoyISO } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

const NOMBRE_ESTADO: Record<EstadoStock, string> = { SIN_STOCK: 'Sin stock', BAJO: 'Bajo el mínimo', OK: 'OK' };

/** [MESÓN] Stock actual con alertas de stock bajo y acceso al kardex de cada producto */
@Component({
  selector: 'app-stock',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Stock actual</h1>
        <p class="pp-texto-suave">Calculado con las facturas, ventas de balanza y conteos. Haga clic en un producto para ver su kardex.</p>
      </div>
      <a routerLink="/meson/conteos/nuevo" class="pp-btn">Registrar conteo físico</a>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (datos(); as d) {
      <div class="tarjetas">
        <button type="button" class="pp-card tarjeta" [class.activa]="!soloAlertas()" (click)="soloAlertas.set(false)">
          <span>Productos activos</span><strong>{{ d.resumen.productos }}</strong>
        </button>
        <button type="button" class="pp-card tarjeta bajo" [class.activa]="soloAlertas()" (click)="soloAlertas.set(true)">
          <span>Bajo el mínimo</span><strong>{{ d.resumen.bajo }}</strong>
        </button>
        <button type="button" class="pp-card tarjeta sin" [class.activa]="soloAlertas()" (click)="soloAlertas.set(true)">
          <span>Sin stock</span><strong>{{ d.resumen.sinStock }}</strong>
        </button>
      </div>
    }

    <section class="pp-card">
      <div class="filtros">
        <input type="search" placeholder="Buscar por nombre, PLU o escanear código…" (input)="busqueda.set($any($event.target).value)" aria-label="Buscar producto" />
        <div class="chips" role="group" aria-label="Filtrar por categoría">
          <button type="button" class="chip" [class.activo]="categoria() === null" (click)="categoria.set(null)">Todas</button>
          @for (c of categorias; track c) {
            <button type="button" class="chip" [class.activo]="categoria() === c" (click)="categoria.set(c)">{{ nombreCategoria[c] }}</button>
          }
        </div>
        <label class="check">
          <input type="checkbox" [checked]="soloAlertas()" (change)="soloAlertas.set($any($event.target).checked)" /> Solo alertas
        </label>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cargar()">Actualizar</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="exportar()">Exportar Excel (CSV)</button>
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>PLU</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th class="num">Stock</th>
              <th class="num">Mínimo</th>
              <th class="num">Para reponer</th>
              <th>Estado</th>
              <th>Último movimiento</th>
            </tr>
          </thead>
          <tbody>
            @for (f of visibles(); track f.id) {
              <tr class="fila" [routerLink]="['/meson/kardex', f.id]" tabindex="0">
                <td><code>{{ f.plu }}</code></td>
                <td><strong>{{ f.nombre }}</strong></td>
                <td>{{ nombreCategoria[f.categoria] }}</td>
                <td class="num">{{ f.stockActual | number: '1.0-3' }} {{ f.unidad === 'KG' ? 'kg' : 'un.' }}</td>
                <td class="num">{{ f.stockMinimo | number: '1.0-3' }}</td>
                <td class="num">{{ f.faltante ? (f.faltante | number: '1.0-3') : '—' }}</td>
                <td><span class="estado" [attr.data-estado]="f.estado">{{ nombreEstado[f.estado] }}</span></td>
                <td class="sub">{{ f.ultimoMovimiento ? (f.ultimoMovimiento | date: 'dd-MM-yyyy HH:mm') : 'Sin movimientos' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="pp-texto-suave">
                  {{ cargando() ? 'Cargando…' : soloAlertas() ? 'Ningún producto con alerta. ¡Todo en orden!' : 'No hay productos para ese filtro.' }}
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
    .encabezado a {
      text-decoration: none;
    }
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .tarjeta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font: inherit;
      text-align: left;
      cursor: pointer;
      border-left: 5px solid var(--pp-celeste);
    }
    .tarjeta strong {
      font-size: 1.6rem;
      color: var(--pp-celeste-oscuro);
    }
    .tarjeta.bajo {
      border-left-color: var(--pp-alerta);
    }
    .tarjeta.bajo strong {
      color: var(--pp-alerta);
    }
    .tarjeta.sin {
      border-left-color: var(--pp-error);
    }
    .tarjeta.sin strong {
      color: var(--pp-error);
    }
    .tarjeta.activa {
      background: var(--pp-celeste-claro);
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
    .sub {
      font-size: 0.8rem;
      color: var(--pp-texto-suave);
    }
    tr.fila {
      cursor: pointer;
    }
    tr.fila:hover td,
    tr.fila:focus td {
      background: var(--pp-celeste-claro);
    }
    .estado {
      display: inline-block;
      padding: 0.05rem 0.55rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      background: #e3f6ea;
      color: var(--pp-exito);
    }
    .estado[data-estado='BAJO'] {
      background: #fff1dc;
      color: var(--pp-alerta);
    }
    .estado[data-estado='SIN_STOCK'] {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class StockComponent {
  private readonly api = inject(MesonService);

  protected readonly categorias = Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[];
  protected readonly nombreCategoria = NOMBRE_CATEGORIA;
  protected readonly nombreEstado = NOMBRE_ESTADO;

  protected readonly datos = signal<Stock | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busqueda = signal('');
  protected readonly categoria = signal<CategoriaProducto | null>(null);
  protected readonly soloAlertas = signal(false);

  protected readonly visibles = computed<FilaStock[]>(() => {
    const q = this.busqueda().trim().toLowerCase();
    return (this.datos()?.filas ?? [])
      .filter(
        (f) =>
          (!this.soloAlertas() || f.estado !== 'OK') &&
          (this.categoria() === null || f.categoria === this.categoria()) &&
          (!q || f.nombre.toLowerCase().includes(q) || f.plu.toLowerCase().startsWith(q) || coincideBarras(f.codigoBarras, q)),
      )
      // Primero lo más urgente
      .sort((a, b) => this.urgencia(a) - this.urgencia(b) || a.nombre.localeCompare(b.nombre));
  });

  constructor() {
    this.cargar();
  }

  private urgencia(f: FilaStock): number {
    return f.estado === 'SIN_STOCK' ? 0 : f.estado === 'BAJO' ? 1 : 2;
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.stock().subscribe({
      next: (d) => {
        this.datos.set(d);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo cargar el stock.'));
        this.cargando.set(false);
      },
    });
  }

  exportar(): void {
    descargarCsv(`stock-${hoyISO()}.csv`, [
      ['PLU', 'Producto', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Para reponer', 'Estado'],
      ...this.visibles().map((f) => [
        f.plu,
        f.nombre,
        this.nombreCategoria[f.categoria],
        f.unidad === 'KG' ? 'Kg' : 'Unidad',
        f.stockActual,
        f.stockMinimo,
        f.faltante,
        this.nombreEstado[f.estado],
      ]),
    ]);
  }
}
