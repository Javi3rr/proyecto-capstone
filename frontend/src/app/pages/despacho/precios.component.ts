import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { mensajeError } from '../../core/errores';
import { Cliente, PrecioKg } from '../../core/models';
import { DespachoService, hoyISO } from './despacho.service';

/** [DESPACHO] Configurar el precio del kg (general) y ver los precios especiales por cliente */
@Component({
  selector: 'app-precios',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Precio del kg de pan</h1>
      <p class="pp-texto-suave">
        Un cambio de precio no modifica guías ya emitidas: cada guía guarda el precio con que se generó.
      </p>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <div class="grilla">
      <section class="pp-card vigente">
        <h2>Precio general vigente</h2>
        @if (vigente(); as p) {
          <p class="valor">{{ num(p.valor) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }} <span>/ kg</span></p>
          <p class="pp-texto-suave">Desde el {{ p.vigenteDesde | date: 'dd-MM-yyyy' : 'UTC' }}</p>
        } @else {
          <p class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'Aún no se ha definido un precio.' }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate class="nuevo">
          <h3>Registrar nuevo precio</h3>
          <div class="fila">
            <div class="pp-campo">
              <label for="valor">Precio por kg *</label>
              <input id="valor" type="number" min="1" step="1" formControlName="valor" />
            </div>
            <div class="pp-campo">
              <label for="desde">Vigente desde *</label>
              <input id="desde" type="date" formControlName="vigenteDesde" />
            </div>
          </div>
          <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar precio' }}</button>
        </form>
      </section>

      <section class="pp-card">
        <h2>Clientes con condiciones especiales</h2>
        <table class="pp-tabla">
          <thead>
            <tr><th>Cliente</th><th>Precio kg</th><th>Desc. diario</th></tr>
          </thead>
          <tbody>
            @for (c of especiales(); track c.id) {
              <tr>
                <td><strong>{{ c.nombre }}</strong></td>
                <td>
                  {{ c.precioKgEspecial !== null ? (num(c.precioKgEspecial) | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : 'General' }}
                </td>
                <td>{{ num(c.kgDescuentoDiario) > 0 ? (num(c.kgDescuentoDiario) | number: '1.0-3') + ' kg' : '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="pp-texto-suave">Todos los clientes pagan el precio general.</td></tr>
            }
          </tbody>
        </table>
        <p class="pp-texto-suave nota">Estas condiciones se editan en la pestaña Clientes.</p>
      </section>
    </div>

    <section class="pp-card historial">
      <h2>Historial de precios</h2>
      <table class="pp-tabla">
        <thead>
          <tr><th>Vigente desde</th><th>Precio kg</th><th>Registrado</th></tr>
        </thead>
        <tbody>
          @for (p of historial(); track p.id) {
            <tr>
              <td>{{ p.vigenteDesde | date: 'dd-MM-yyyy' : 'UTC' }}</td>
              <td>{{ num(p.valor) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
              <td>{{ p.creadoEn | date: 'dd-MM-yyyy HH:mm' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="3" class="pp-texto-suave">Sin registros.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .grilla {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    h3 {
      font-size: 0.95rem;
      margin-top: 1.25rem;
    }
    .valor {
      font-size: 2.2rem;
      font-weight: 800;
      margin: 0;
      color: var(--pp-celeste-oscuro);
    }
    .valor span {
      font-size: 1rem;
      font-weight: 600;
      color: var(--pp-texto-suave);
    }
    .vigente > p {
      margin: 0;
    }
    .nuevo {
      border-top: 1px solid var(--pp-borde);
      margin-top: 1rem;
    }
    .fila {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .fila .pp-campo {
      flex: 1;
      min-width: 140px;
    }
    .nota {
      font-size: 0.85rem;
      margin: 0.5rem 0 0;
    }
  `,
})
export class PreciosComponent {
  private readonly api = inject(DespachoService);
  private readonly fb = inject(FormBuilder);

  protected readonly vigente = signal<PrecioKg | null>(null);
  protected readonly historial = signal<PrecioKg[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly especiales = computed(() =>
    this.clientes().filter((c) => c.precioKgEspecial !== null || Number(c.kgDescuentoDiario) > 0),
  );

  protected readonly form = this.fb.group({
    valor: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    vigenteDesde: this.fb.nonNullable.control(hoyISO(), [Validators.required]),
  });

  constructor() {
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  cargar(): void {
    this.cargando.set(true);
    forkJoin({
      vigente: this.api.precioVigente(),
      historial: this.api.historialPrecios(),
      clientes: this.api.clientes(),
    }).subscribe({
      next: ({ vigente, historial, clientes }) => {
        this.vigente.set(vigente);
        this.historial.set(historial);
        this.clientes.set(clientes);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los precios.'));
        this.cargando.set(false);
      },
    });
  }

  guardar(): void {
    this.error.set(null);
    this.mensaje.set(null);
    const { valor, vigenteDesde } = this.form.getRawValue();
    if (this.form.invalid || valor === null) {
      this.error.set('Ingrese un precio mayor a 0 y una fecha.');
      return;
    }
    if (!confirm(`¿Registrar el precio de $${valor.toLocaleString('es-CL')} por kg desde el ${vigenteDesde}?`)) return;

    this.guardando.set(true);
    this.api.crearPrecio(valor, vigenteDesde).subscribe({
      next: () => {
        this.guardando.set(false);
        this.mensaje.set('Precio registrado.');
        this.form.reset({ valor: null, vigenteDesde: hoyISO() });
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
