import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CampoMapeo, Mapeo, Planilla, aNumero, aTexto, adivinarMapeo, detectarFilaTitulos, leerPlanilla } from '../../core/excel';
import { mensajeError } from '../../core/errores';
import { LineaVentaArchivo, ResultadoImportacionVentas } from '../../core/models';
import { MapeoColumnasComponent } from '../../shared/mapeo-columnas.component';
import { hoyISO } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

const CAMPOS: CampoMapeo[] = [
  { clave: 'fecha', etiqueta: 'Fecha', ayuda: 'Si no viene, elija la fecha más abajo.', sinonimos: ['fecha', 'date', 'dia', 'fecha venta', 'fecha hora'] },
  { clave: 'plu', etiqueta: 'Código PLU', ayuda: 'PLU o nombre: al menos uno.', sinonimos: ['plu', 'plu no', 'codigo plu', 'codigo', 'cod', 'item'] },
  { clave: 'descripcion', etiqueta: 'Nombre del producto', sinonimos: ['nombre', 'descripcion', 'producto', 'articulo', 'name', 'detalle'] },
  { clave: 'cantidad', etiqueta: 'Cantidad o kg', ayuda: 'Si no viene, se cuenta 1 por fila.', sinonimos: ['cantidad', 'cant', 'qty', 'peso', 'kg', 'unidades', 'count', 'weight'] },
  { clave: 'monto', etiqueta: 'Monto vendido ($)', requerido: true, sinonimos: ['monto', 'total', 'importe', 'venta', 'amount', 'precio total', 'valor'] },
  { clave: 'mesonera', etiqueta: 'Mesonera (clerk)', ayuda: 'Número de vendedor de la balanza (V1–V4).', sinonimos: ['clerk', 'vendedor', 'mesonera', 'operador', 'cajero', 'usuario', 'seller'] },
];

/** [MESÓN] Importar el archivo de ventas exportado desde el software de las balanzas */
@Component({
  selector: 'app-ventas-importar',
  imports: [RouterLink, CurrencyPipe, DatePipe, DecimalPipe, MapeoColumnasComponent],
  template: `
    <a routerLink="/meson/ventas" class="volver">← Ventas</a>
    <header class="encabezado">
      <h1>Importar archivo de ventas</h1>
      <p class="pp-texto-suave">
        Suba el Excel o CSV de ventas que exporta el software de las balanzas. Indique qué columna es cada dato,
        revise el resumen y confirme. Las ventas de productos del catálogo se descuentan del stock.
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <h2>1. Archivo</h2>
      <input type="file" accept=".xlsx,.xls,.csv,.txt" (change)="elegir($event)" [disabled]="trabajando()" />
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
          <span class="pp-texto-suave">{{ datos().length }} filas de datos</span>
        </div>
      }
    </section>

    @if (planilla()) {
      <section class="pp-card">
        <h2>2. ¿Qué columna es cada dato?</h2>
        <app-mapeo-columnas [campos]="campos" [titulos]="titulos()" [datos]="datos()" [(mapeo)]="mapeo" />
        <div class="opciones">
          @if (mapeo()['fecha'] === null) {
            <label>Fecha de estas ventas *
              <input type="date" [max]="hoy" [value]="fechaPorDefecto()" (change)="fechaPorDefecto.set($any($event.target).value)" />
            </label>
          }
          <button type="button" class="pp-btn" [disabled]="trabajando() || !!faltante()" (click)="enviar(true)">
            {{ trabajando() ? 'Revisando…' : 'Revisar' }}
          </button>
          @if (faltante()) {
            <span class="pp-texto-suave">{{ faltante() }}</span>
          }
        </div>
      </section>
    }

    @if (resultado(); as r) {
      <section class="pp-card">
        <h2>3. Revise antes de confirmar</h2>
        <p>
          Ventas del <strong>{{ r.periodo.desde | date: 'dd-MM-yyyy' : 'UTC' }}</strong>
          @if (r.periodo.hasta !== r.periodo.desde) {
            al <strong>{{ r.periodo.hasta | date: 'dd-MM-yyyy' : 'UTC' }}</strong>
          }
          ({{ r.periodo.dias }} día(s)).
        </p>
        <div class="tarjetas">
          <div class="pp-card tarjeta"><span>Total vendido</span><strong>{{ r.totales.ventas | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
          <div class="pp-card tarjeta ok"><span>Productos del catálogo</span><strong>{{ r.totales.productos | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong><small>{{ r.productosConStock }} producto(s) descuentan stock</small></div>
          <div class="pp-card tarjeta misc"><span>"Misc." (sin producto)</span><strong>{{ r.totales.misc | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
          <div class="pp-card tarjeta sin"><span>No reconocidos</span><strong>{{ r.totales.sinProducto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></div>
        </div>

        @for (a of r.advertencias; track $index) {
          <p class="pp-alerta-error">{{ a }}</p>
        }

        @if (r.sinProducto.length) {
          <details open>
            <summary>No reconocidos ({{ r.sinProducto.length }}): no descuentan stock</summary>
            <p class="pp-texto-suave nota">
              No coinciden con ningún PLU ni nombre del catálogo. Si son productos reales, créelos o corrija su PLU en
              <a routerLink="/meson/productos">Productos</a> y vuelva a revisar.
            </p>
            <div class="tabla-scroll">
              <table class="pp-tabla">
                <thead><tr><th>PLU</th><th>Nombre en el archivo</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead>
                <tbody>
                  @for (s of r.sinProducto.slice(0, 200); track $index) {
                    <tr>
                      <td>{{ s.plu ?? '—' }}</td>
                      <td>{{ s.descripcion }}</td>
                      <td class="num">{{ s.cantidad | number: '1.0-3' }}</td>
                      <td class="num">{{ s.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }

        @if (r.mesoneras.length) {
          <details>
            <summary>Por mesonera</summary>
            <div class="tabla-scroll">
              <table class="pp-tabla">
                <thead><tr><th>Fecha</th><th>Mesonera</th><th class="num">Vendido</th><th class="num">"Misc."</th></tr></thead>
                <tbody>
                  @for (m of r.mesoneras; track $index) {
                    <tr>
                      <td>{{ m.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                      <td>V{{ m.codigoMesonera }}</td>
                      <td class="num">{{ m.monto | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                      <td class="num">{{ m.montoMisc | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        } @else {
          <p class="pp-texto-suave nota">El archivo no indica mesonera: el reporte por mesonera no incluirá estas ventas.</p>
        }

        @if (r.errores.length) {
          <details>
            <summary>Filas con error ({{ r.errores.length }}): no se importan</summary>
            <ul class="lista">
              @for (e of r.errores.slice(0, 100); track $index) {
                <li>Fila {{ e.fila }}: {{ e.mensaje }}</li>
              }
            </ul>
          </details>
        }
        @if (r.omitidas) {
          <p class="pp-texto-suave nota">{{ r.omitidas }} fila(s) vacías o de totales fueron omitidas.</p>
        }

        <div class="acciones">
          <button type="button" class="pp-btn" [disabled]="trabajando() || r.advertencias.length > 0" (click)="enviar(false)">
            {{ trabajando() ? 'Importando…' : 'Confirmar e importar' }}
          </button>
        </div>
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
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .tarjeta {
      display: flex;
      flex-direction: column;
      border-left: 5px solid var(--pp-celeste);
    }
    .tarjeta strong {
      font-size: 1.3rem;
    }
    .tarjeta small {
      color: var(--pp-texto-suave);
    }
    .tarjeta.ok {
      border-left-color: var(--pp-exito);
    }
    .tarjeta.misc {
      border-left-color: var(--pp-alerta);
    }
    .tarjeta.sin {
      border-left-color: var(--pp-error);
    }
    details {
      margin-top: 0.75rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .nota {
      font-size: 0.85rem;
      margin: 0.4rem 0;
    }
    .lista {
      max-height: 240px;
      overflow: auto;
      font-size: 0.85rem;
    }
    .tabla-scroll {
      overflow: auto;
      max-height: 300px;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
      margin-top: 1rem;
    }
  `,
})
export class VentasImportarComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly campos = CAMPOS;
  protected readonly hoy = hoyISO();
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly filaTitulos = signal(0);
  protected readonly mapeo = signal<Mapeo>({});
  protected readonly fechaPorDefecto = signal(hoyISO());
  protected readonly resultado = signal<ResultadoImportacionVentas | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  private archivo: File | null = null;

  protected readonly titulos = computed(() => this.planilla()?.filas[this.filaTitulos()] ?? []);
  protected readonly datos = computed(() => (this.planilla()?.filas ?? []).slice(this.filaTitulos() + 1));
  protected readonly faltante = computed(() => {
    const m = this.mapeo();
    if (m['monto'] === null || m['monto'] === undefined) return 'Indique la columna del monto vendido.';
    if ((m['plu'] ?? null) === null && (m['descripcion'] ?? null) === null) return 'Indique la columna del PLU o del nombre del producto.';
    if ((m['fecha'] ?? null) === null && !this.fechaPorDefecto()) return 'Indique la fecha de las ventas.';
    return null;
  });

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
    const base = this.filaTitulos() + 2;
    const lineas: LineaVentaArchivo[] = this.datos().map((f, i) => ({
      fila: base + i,
      fecha: aTexto(col(f, 'fecha')),
      plu: aTexto(col(f, 'plu'))?.slice(0, 50) ?? null,
      descripcion: aTexto(col(f, 'descripcion'))?.slice(0, 200) ?? null,
      cantidad: aNumero(col(f, 'cantidad')),
      monto: aNumero(col(f, 'monto')),
      mesonera: aTexto(col(f, 'mesonera'))?.slice(0, 20) ?? null,
    }));
    if (!simular && !confirm('¿Importar estas ventas? Se descontará del stock lo vendido de cada producto.')) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.api
      .importarVentas({
        nombreArchivo: this.archivo?.name ?? 'archivo',
        fechaPorDefecto: m['fecha'] === null || m['fecha'] === undefined ? this.fechaPorDefecto() : undefined,
        lineas,
        simular,
      })
      .subscribe({
        next: (r) => {
          this.trabajando.set(false);
          if (r.guardado && r.importacionId) {
            void this.router.navigate(['/meson/ventas', r.importacionId], { state: { nueva: true } });
            return;
          }
          this.resultado.set(r);
        },
        error: (e) => {
          this.trabajando.set(false);
          this.error.set(mensajeError(e, 'No se pudo procesar el archivo.'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      });
  }
}
