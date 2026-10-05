import { Component, computed, input, model } from '@angular/core';
import { Celda, CampoMapeo, Mapeo, letraColumna } from '../core/excel';

/**
 * Permite indicar qué columna del Excel corresponde a cada dato que necesita el sistema,
 * con una vista previa de las primeras filas. Se usa en las importaciones de productos y ventas.
 */
@Component({
  selector: 'app-mapeo-columnas',
  template: `
    <div class="campos">
      @for (c of campos(); track c.clave) {
        <label class="campo" [class.falta]="c.requerido && mapeo()[c.clave] === null">
          <span>{{ c.etiqueta }}{{ c.requerido ? ' *' : '' }}</span>
          <select (change)="asignar(c.clave, $any($event.target).value)">
            <option value="" [selected]="mapeo()[c.clave] === null">— No viene en el archivo —</option>
            @for (t of titulos(); track $index) {
              <option [value]="$index" [selected]="mapeo()[c.clave] === $index">{{ letra($index) }} · {{ t ?? '(sin título)' }}</option>
            }
          </select>
          @if (c.ayuda) {
            <small>{{ c.ayuda }}</small>
          }
        </label>
      }
    </div>

    <p class="pp-texto-suave vista-titulo">Vista previa (primeras {{ muestra().length }} filas de datos):</p>
    <div class="tabla-scroll">
      <table class="pp-tabla vista">
        <thead>
          <tr>
            @for (t of titulos(); track $index) {
              <th [class.usada]="usada($index)">
                <small>{{ letra($index) }}</small> {{ t ?? '' }}
                @if (campoDe($index); as nombre) {
                  <span class="etiqueta">→ {{ nombre }}</span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (f of muestra(); track $index) {
            <tr>
              @for (t of titulos(); track $index; let j = $index) {
                <td [class.usada]="usada(j)">{{ f[j] ?? '' }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .campos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 0.6rem 1rem;
      margin-bottom: 0.75rem;
    }
    .campo {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .campo select {
      min-height: 36px;
      padding: 0.25rem 0.4rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.88rem var(--pp-fuente);
    }
    .campo small {
      font-weight: 400;
      color: var(--pp-texto-suave);
    }
    .campo.falta select {
      border-color: var(--pp-alerta);
      background: #fff8ec;
    }
    .vista-titulo {
      margin: 0.25rem 0;
      font-size: 0.82rem;
    }
    .tabla-scroll {
      overflow-x: auto;
      max-height: 260px;
    }
    .vista {
      font-size: 0.78rem;
    }
    .vista th,
    .vista td {
      padding: 0.2rem 0.4rem;
      white-space: nowrap;
    }
    .vista th small {
      color: var(--pp-texto-suave);
    }
    .usada {
      background: var(--pp-celeste-claro);
    }
    .etiqueta {
      display: block;
      font-size: 0.7rem;
      color: var(--pp-celeste-oscuro);
    }
  `,
})
export class MapeoColumnasComponent {
  readonly campos = input.required<CampoMapeo[]>();
  readonly titulos = input.required<Celda[]>();
  readonly datos = input.required<Celda[][]>();
  readonly mapeo = model.required<Mapeo>();

  protected readonly muestra = computed(() => this.datos().slice(0, 8));

  protected letra(i: number): string {
    return letraColumna(i);
  }

  protected usada(i: number): boolean {
    return Object.values(this.mapeo()).includes(i);
  }

  protected campoDe(i: number): string | null {
    const c = this.campos().find((x) => this.mapeo()[x.clave] === i);
    return c ? c.etiqueta : null;
  }

  asignar(clave: string, valor: string): void {
    this.mapeo.set({ ...this.mapeo(), [clave]: valor === '' ? null : Number(valor) });
  }
}
