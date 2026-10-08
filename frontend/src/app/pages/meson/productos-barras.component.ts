import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CampoMapeo, Mapeo, Planilla, aTexto, adivinarMapeo, detectarFilaTitulos, leerPlanilla } from '../../core/excel';
import { mensajeError } from '../../core/errores';
import { ResultadoImportacionBarras } from '../../core/models';
import { MapeoColumnasComponent } from '../../shared/mapeo-columnas.component';
import { MesonService } from './meson.service';

const CAMPOS: CampoMapeo[] = [
  { clave: 'plu', etiqueta: 'Código PLU', requerido: true, sinonimos: ['plu no', 'plu', 'n plu', 'codigo plu'] },
  {
    clave: 'codigo',
    etiqueta: 'Código de barras',
    requerido: true,
    ayuda: 'En el ScannerMap de CAS es "Código de mapeo".',
    sinonimos: ['codigo de mapeo', 'codigo de barras', 'ean', 'barras', 'mapeo', 'barcode'],
  },
];

/** [MESÓN] Asignar códigos de barras a los productos desde el ScannerMap de las balanzas */
@Component({
  selector: 'app-productos-barras',
  imports: [RouterLink, MapeoColumnasComponent],
  template: `
    <a routerLink="/meson/productos" class="volver">← Productos</a>
    <header class="encabezado">
      <h1>Importar códigos de barras</h1>
      <p class="pp-texto-suave">
        Suba el <strong>ScannerMap</strong> de las balanzas. A cada producto (por su PLU) se le asigna su código de barras, para
        poder buscarlo escaneando en facturas, conteos y stock. Importe primero los productos (PLUData).
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <h2>1. Archivo</h2>
      <input type="file" accept=".xlsx,.xls,.csv" (change)="elegir($event)" [disabled]="trabajando()" />
      @if (planilla(); as p) {
        <p class="pp-texto-suave">{{ datos().length }} filas en "{{ p.hoja }}"</p>
      }
    </section>

    @if (planilla()) {
      <section class="pp-card">
        <h2>2. ¿Qué columna es cada dato?</h2>
        <app-mapeo-columnas [campos]="campos" [titulos]="titulos()" [datos]="datos()" [(mapeo)]="mapeo" />
        <button type="button" class="pp-btn" [disabled]="trabajando() || !mapeoCompleto()" (click)="enviar(true)">
          {{ trabajando() ? 'Revisando…' : 'Revisar' }}
        </button>
      </section>
    }

    @if (resultado(); as r) {
      <section class="pp-card">
        <h2>3. {{ r.guardado ? 'Códigos asignados' : 'Revise antes de confirmar' }}</h2>
        <div class="resumen">
          <span class="nuevo"><strong>{{ r.asignados.length }}</strong> por asignar o cambiar</span>
          <span><strong>{{ r.sinCambios }}</strong> ya estaban</span>
          <span><strong>{{ r.sinCodigo }}</strong> sin código de barras propio</span>
          <span class="error"><strong>{{ r.noEncontrados.length }}</strong> PLU que no existen en Productos</span>
        </div>
        @if (r.compartidos.length) {
          <p class="advertencia">
            ⚠ {{ r.compartidos.length }} código(s) de barras se repiten en más de un producto ({{ r.compartidos.slice(0, 6).join(', ') }}…).
            Al escanearlos, el sistema le pedirá elegir cuál es.
          </p>
        }
        @if (r.noEncontrados.length) {
          <p class="advertencia">⚠ PLU sin producto: {{ r.noEncontrados.slice(0, 30).join(', ') }}. Importe primero el PLUData.</p>
        }

        @if (r.guardado) {
          <p class="pp-aviso-ok">Listo. <a routerLink="/meson/productos">Ver productos</a></p>
        } @else if (r.asignados.length) {
          <button type="button" class="pp-btn" [disabled]="trabajando()" (click)="enviar(false)">
            {{ trabajando() ? 'Guardando…' : 'Confirmar ' + r.asignados.length + ' código(s)' }}
          </button>
          <details>
            <summary>Ver detalle</summary>
            <ul class="lista">
              @for (a of r.asignados.slice(0, 400); track a.plu) {
                <li><strong>{{ a.plu }} · {{ a.nombre }}</strong>: {{ a.antes ?? 'sin código' }} → {{ a.despues }}</li>
              }
            </ul>
          </details>
        } @else {
          <p class="pp-texto-suave">No hay códigos nuevos que asignar.</p>
        }

        @if (r.errores.length) {
          <details>
            <summary>Filas con error ({{ r.errores.length }})</summary>
            <ul class="lista">
              @for (e of r.errores.slice(0, 100); track $index) {
                <li>Fila {{ e.fila }}: {{ e.mensaje }}</li>
              }
            </ul>
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
    .resumen {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 0.75rem;
    }
    .nuevo strong {
      color: var(--pp-exito);
    }
    .error strong {
      color: var(--pp-error);
    }
    .advertencia {
      margin: 0.3rem 0 0.6rem;
      padding: 0.4rem 0.6rem;
      background: #fff8ec;
      border-left: 4px solid var(--pp-alerta);
      font-size: 0.85rem;
    }
    details {
      margin-top: 0.75rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .lista {
      max-height: 280px;
      overflow: auto;
      font-size: 0.85rem;
    }
  `,
})
export class ProductosBarrasComponent {
  private readonly api = inject(MesonService);

  protected readonly campos = CAMPOS;
  protected readonly planilla = signal<Planilla | null>(null);
  protected readonly filaTitulos = signal(0);
  protected readonly mapeo = signal<Mapeo>({});
  protected readonly resultado = signal<ResultadoImportacionBarras | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly error = signal<string | null>(null);
  private archivo: File | null = null;

  protected readonly titulos = computed(() => this.planilla()?.filas[this.filaTitulos()] ?? []);
  protected readonly datos = computed(() => (this.planilla()?.filas ?? []).slice(this.filaTitulos() + 1));
  protected readonly mapeoCompleto = computed(() => CAMPOS.every((c) => (this.mapeo()[c.clave] ?? null) !== null));

  async elegir(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.archivo = archivo;
    this.error.set(null);
    this.resultado.set(null);
    this.trabajando.set(true);
    try {
      const p = await leerPlanilla(archivo);
      this.planilla.set(p);
      this.filaTitulos.set(detectarFilaTitulos(p.filas));
      this.mapeo.set(adivinarMapeo(this.titulos(), CAMPOS));
    } catch (e) {
      this.planilla.set(null);
      this.error.set(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
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
    const filas = this.datos().map((f, i) => ({
      fila: base + i,
      plu: aTexto(col(f, 'plu'))?.slice(0, 50) ?? null,
      codigo: aTexto(col(f, 'codigo'))?.slice(0, 50) ?? null,
    }));
    this.trabajando.set(true);
    this.error.set(null);
    this.api.importarBarras({ filas, simular, nombreArchivo: this.archivo?.name ?? 'archivo' }).subscribe({
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
