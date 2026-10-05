import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/errores';
import {
  CategoriaProducto,
  FilaStock,
  MotivoAjuste,
  NOMBRE_CATEGORIA,
  NOMBRE_MOTIVO_AJUSTE,
  NuevoConteo,
} from '../../core/models';
import { MesonService } from './meson.service';

interface Entrada {
  contado: number | null;
  motivo: MotivoAjuste | null;
  detalle: string;
}

/** [MESÓN] Registrar un conteo físico: lo contado vs. lo que dice el sistema */
@Component({
  selector: 'app-conteo-nuevo',
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/conteos" class="volver">← Conteos</a>
    <header class="encabezado">
      <h1>Nuevo conteo físico</h1>
      <p class="pp-texto-suave">
        Escriba la cantidad que hay físicamente. Solo se guardan los productos que cuente.
        Si no coincide con el sistema, indique el motivo; el stock se ajustará y quedará en el kardex.
      </p>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <div class="filtros">
        <input type="search" placeholder="Buscar por nombre o PLU…" (input)="busqueda.set($any($event.target).value)" aria-label="Buscar producto" />
        <div class="chips" role="group" aria-label="Filtrar por categoría">
          <button type="button" class="chip" [class.activo]="categoria() === null" (click)="categoria.set(null)">Todas</button>
          @for (c of categorias; track c) {
            <button type="button" class="chip" [class.activo]="categoria() === c" (click)="categoria.set(c)">{{ nombreCategoria[c] }}</button>
          }
        </div>
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>Producto</th>
              <th class="num">Sistema</th>
              <th class="num">Contado</th>
              <th class="num">Diferencia</th>
              <th>Motivo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            @for (p of visibles(); track p.id) {
              <tr [class.contado]="entrada(p.id).contado !== null" [class.difiere]="diferencia(p) !== 0">
                <td>
                  <strong>{{ p.nombre }}</strong>
                  <small class="sub">PLU {{ p.plu }} · {{ nombreCategoria[p.categoria] }}</small>
                </td>
                <td class="num">{{ p.stockActual | number: '1.0-3' }} {{ p.unidad === 'KG' ? 'kg' : 'un.' }}</td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
                    data-contado
                    [step]="p.unidad === 'KG' ? 0.001 : 1"
                    [value]="entrada(p.id).contado ?? ''"
                    (input)="fijar(p.id, { contado: numOrNull($any($event.target).value) })"
                    (keydown.enter)="siguiente($event)"
                    [attr.aria-label]="'Contado ' + p.nombre"
                  />
                  <button type="button" class="igual" title="Coincide con el sistema" (click)="fijar(p.id, { contado: p.stockActual })">=</button>
                </td>
                <td class="num" [class.falta]="diferencia(p) < 0" [class.sobra]="diferencia(p) > 0">
                  @if (entrada(p.id).contado !== null) {
                    {{ diferencia(p) > 0 ? '+' : '' }}{{ diferencia(p) | number: '1.0-3' }}
                  }
                </td>
                <td>
                  @if (diferencia(p) !== 0) {
                    <select [value]="entrada(p.id).motivo ?? ''" (change)="fijar(p.id, { motivo: $any($event.target).value || null })" [attr.aria-label]="'Motivo ' + p.nombre">
                      <option value="">Seleccione…</option>
                      @for (m of motivos; track m) {
                        <option [value]="m">{{ nombreMotivo[m] }}</option>
                      }
                    </select>
                  }
                </td>
                <td>
                  @if (diferencia(p) !== 0) {
                    <input class="detalle" maxlength="200" placeholder="Opcional" [value]="entrada(p.id).detalle" (input)="fijar(p.id, { detalle: $any($event.target).value })" />
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="pp-texto-suave">{{ cargando() ? 'Cargando productos…' : 'No hay productos activos para contar.' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="pp-card pie">
      <div class="resumen">
        <span><strong>{{ resumen().contados }}</strong> producto(s) contado(s)</span>
        <span [class.falta]="resumen().conDiferencia > 0"><strong>{{ resumen().conDiferencia }}</strong> con diferencia</span>
        <span>
          Valor diferencia (precio venta):
          <strong [class.falta]="resumen().valor < 0" [class.sobra]="resumen().valor > 0">{{ resumen().valor | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong>
        </span>
      </div>
      <div class="pp-campo obs">
        <label for="obs">Observación del conteo</label>
        <input id="obs" maxlength="255" placeholder="Ej. Conteo semanal de cecinas" [value]="observacion()" (input)="observacion.set($any($event.target).value)" />
      </div>
      <div class="acciones">
        <a routerLink="/meson/conteos" class="pp-btn pp-btn--secundario">Cancelar</a>
        <button type="button" class="pp-btn" [disabled]="guardando() || resumen().contados === 0" (click)="guardar()">
          {{ guardando() ? 'Guardando…' : 'Guardar conteo y ajustar stock' }}
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
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla td {
      padding: 0.3rem 0.45rem;
      vertical-align: middle;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .sub {
      display: block;
      font-size: 0.75rem;
      color: var(--pp-texto-suave);
    }
    td input,
    td select {
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      font: 0.9rem var(--pp-fuente);
    }
    td input[type='number'] {
      width: 6.5rem;
      text-align: right;
    }
    .detalle {
      width: 12rem;
    }
    .igual {
      margin-left: 0.25rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 6px;
      background: var(--pp-blanco);
      cursor: pointer;
      font-weight: 700;
      color: var(--pp-celeste-oscuro);
    }
    tr.contado td {
      background: #f7fbfe;
    }
    tr.difiere td {
      background: #fff8ec;
    }
    .falta {
      color: var(--pp-error);
      font-weight: 700;
    }
    .sobra {
      color: var(--pp-exito);
      font-weight: 700;
    }
    .pie {
      position: sticky;
      bottom: 0;
      margin-top: 0.75rem;
      box-shadow: 0 -4px 12px rgba(15, 111, 174, 0.08);
    }
    .resumen {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .obs {
      margin-bottom: 0.5rem;
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
export class ConteoNuevoComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly categorias = Object.keys(NOMBRE_CATEGORIA) as CategoriaProducto[];
  protected readonly nombreCategoria = NOMBRE_CATEGORIA;
  protected readonly motivos = Object.keys(NOMBRE_MOTIVO_AJUSTE) as MotivoAjuste[];
  protected readonly nombreMotivo = NOMBRE_MOTIVO_AJUSTE;

  protected readonly productos = signal<FilaStock[]>([]);
  protected readonly entradas = signal<Record<number, Entrada>>({});
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busqueda = signal('');
  protected readonly categoria = signal<CategoriaProducto | null>(null);
  protected readonly observacion = signal('');

  protected readonly visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    return this.productos().filter(
      (p) =>
        (this.categoria() === null || p.categoria === this.categoria()) &&
        (!q || p.nombre.toLowerCase().includes(q) || p.plu.toLowerCase().startsWith(q)),
    );
  });

  protected readonly resumen = computed(() => {
    let contados = 0;
    let conDiferencia = 0;
    let valor = 0;
    for (const p of this.productos()) {
      if (this.entradas()[p.id]?.contado == null) continue;
      contados++;
      const d = this.diferencia(p);
      if (d !== 0) conDiferencia++;
      valor += d * p.precioVenta;
    }
    return { contados, conDiferencia, valor: Math.round(valor) };
  });

  constructor() {
    this.api.stock().subscribe({
      next: (s) => {
        this.productos.set(s.filas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los productos.'));
        this.cargando.set(false);
      },
    });
  }

  protected numOrNull(v: string): number | null {
    return v === '' ? null : Number(v);
  }

  protected entrada(id: number): Entrada {
    return this.entradas()[id] ?? { contado: null, motivo: null, detalle: '' };
  }

  protected diferencia(p: FilaStock): number {
    const c = this.entrada(p.id).contado;
    return c === null ? 0 : Math.round((c - p.stockActual) * 1000) / 1000;
  }

  fijar(id: number, cambios: Partial<Entrada>): void {
    this.entradas.update((e) => ({ ...e, [id]: { ...this.entrada(id), ...cambios } }));
  }

  siguiente(evento: Event): void {
    evento.preventDefault();
    const actual = evento.target as HTMLInputElement;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-contado]'));
    const sig = inputs[inputs.indexOf(actual) + 1];
    if (sig) {
      sig.focus();
      sig.select();
    }
  }

  guardar(): void {
    const lineas: NuevoConteo['lineas'] = [];
    for (const p of this.productos()) {
      const e = this.entrada(p.id);
      if (e.contado === null) continue;
      if (!Number.isFinite(e.contado) || e.contado < 0) {
        this.error.set(`"${p.nombre}": cantidad contada inválida.`);
        return;
      }
      if (p.unidad === 'UNIDAD' && !Number.isInteger(e.contado)) {
        this.error.set(`"${p.nombre}" se cuenta por unidad: use números enteros.`);
        return;
      }
      const d = this.diferencia(p);
      if (d !== 0 && !e.motivo) {
        this.error.set(`"${p.nombre}" tiene diferencia: seleccione el motivo.`);
        return;
      }
      lineas.push({
        productoId: p.id,
        stockContado: e.contado,
        motivo: d !== 0 ? e.motivo! : undefined,
        detalle: d !== 0 ? e.detalle.trim() || null : null,
      });
    }
    if (lineas.length === 0) return;

    const r = this.resumen();
    const ok = confirm(
      `Se guardará el conteo de ${r.contados} producto(s).\n` +
        (r.conDiferencia > 0
          ? `${r.conDiferencia} tienen diferencia y su stock se ajustará (queda en el kardex).`
          : 'Todo coincide con el sistema; no se ajustará el stock.'),
    );
    if (!ok) return;

    this.guardando.set(true);
    this.error.set(null);
    this.api.crearConteo({ observacion: this.observacion().trim() || null, lineas }).subscribe({
      next: (c) => void this.router.navigate(['/meson/conteos', c.id], { state: { nuevo: true } }),
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }
}
