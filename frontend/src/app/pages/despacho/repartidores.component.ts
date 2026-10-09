import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { mensajeError } from '../../core/errores';
import { Repartidor, RepartidorForm } from '../../core/models';
import { DespachoService } from './despacho.service';

type Edicion = { tipo: 'nuevo' } | { tipo: 'editar'; repartidor: Repartidor };

/** [DESPACHO] Gestionar los repartidores para asociarlos a sus rutas, su entrega del día y su paga */
@Component({
  selector: 'app-repartidores',
  imports: [ReactiveFormsModule, CurrencyPipe],
  template: `
    <header class="encabezado">
      <div>
        <h1>Repartidores</h1>
        <p class="pp-texto-suave">Cada cliente de reparto o de pago día siguiente queda asociado a un repartidor.</p>
      </div>
      <button type="button" class="pp-btn" (click)="abrirNuevo()">+ Nuevo repartidor</button>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (edicion(); as ed) {
      <section class="pp-card formulario">
        <h2>{{ ed.tipo === 'nuevo' ? 'Nuevo repartidor' : 'Editar: ' + ed.repartidor.nombre }}</h2>
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="grilla-form">
            <div class="pp-campo">
              <label for="nombre">Nombre *</label>
              <input id="nombre" formControlName="nombre" maxlength="120" />
            </div>
            <div class="pp-campo">
              <label for="rut">RUT</label>
              <input id="rut" formControlName="rut" placeholder="12.345.678-9" maxlength="12" />
            </div>
            <div class="pp-campo">
              <label for="patente">Patente del furgón</label>
              <input id="patente" formControlName="patente" placeholder="ABCD12" maxlength="10" />
            </div>
            <div class="pp-campo">
              <label for="paga">Paga habitual por día ($)</label>
              <input id="paga" type="number" min="0" step="500" formControlName="pagaDiaria" />
            </div>
          </div>
          <div class="acciones">
            <button type="button" class="pp-btn pp-btn--secundario" (click)="edicion.set(null)">Cancelar</button>
            <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </section>
    }

    <section class="pp-card">
      <label class="check">
        <input type="checkbox" #ch (change)="mostrarInactivos.set(ch.checked)" /> Mostrar desactivados
      </label>
      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RUT</th>
              <th>Patente</th>
              <th>Paga diaria</th>
              <th>Clientes activos</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of visibles(); track r.id) {
              <tr [class.inactivo]="!r.activo">
                <td><strong>{{ r.nombre }}</strong></td>
                <td>{{ r.rut ?? '—' }}</td>
                <td>{{ r.patente ?? '—' }}</td>
                <td>{{ r.pagaDiaria | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td>{{ r._count?.clientes ?? 0 }}</td>
                <td>{{ r.activo ? 'Activo' : 'Desactivado' }}</td>
                <td class="botones">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="abrirEditar(r)">Editar</button>
                  @if (r.activo) {
                    <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="desactivar(r)">Desactivar</button>
                  } @else {
                    <button type="button" class="pp-btn pp-btn--chico" (click)="reactivar(r)">Reactivar</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'No hay repartidores.' }}</td></tr>
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
    .formulario {
      margin-bottom: 1.25rem;
      border-left: 5px solid var(--pp-celeste);
    }
    .formulario h2 {
      font-size: 1.1rem;
    }
    .grilla-form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      column-gap: 1rem;
    }
    .acciones {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
    }
    .tabla-scroll {
      overflow-x: auto;
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
  `,
})
export class RepartidoresComponent {
  private readonly api = inject(DespachoService);
  private readonly fb = inject(FormBuilder);

  protected readonly repartidores = signal<Repartidor[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly edicion = signal<Edicion | null>(null);
  protected readonly mostrarInactivos = signal(false);

  protected readonly visibles = computed(() =>
    this.repartidores().filter((r) => this.mostrarInactivos() || r.activo),
  );

  protected readonly form = this.fb.group({
    nombre: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    rut: this.fb.control<string | null>(null),
    patente: this.fb.control<string | null>(null),
    pagaDiaria: this.fb.control<number | null>(20000, [Validators.required, Validators.min(0)]),
  });

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.repartidores(true).subscribe({
      next: (data) => {
        this.repartidores.set(data);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los repartidores.'));
        this.cargando.set(false);
      },
    });
  }

  abrirNuevo(): void {
    this.limpiarAvisos();
    this.form.reset({ nombre: '', rut: null, patente: null, pagaDiaria: 20000 });
    this.edicion.set({ tipo: 'nuevo' });
  }

  abrirEditar(r: Repartidor): void {
    this.limpiarAvisos();
    this.form.reset({ nombre: r.nombre, rut: r.rut, patente: r.patente, pagaDiaria: Number(r.pagaDiaria) });
    this.edicion.set({ tipo: 'editar', repartidor: r });
  }

  guardar(): void {
    const ed = this.edicion();
    if (!ed) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('El nombre es obligatorio y la paga no puede ser negativa.');
      return;
    }
    const v = this.form.getRawValue();
    const datos: RepartidorForm = {
      nombre: v.nombre.trim(),
      rut: v.rut?.trim() || null,
      patente: v.patente?.trim() || null,
      pagaDiaria: Math.round(v.pagaDiaria ?? 0),
    };

    this.guardando.set(true);
    this.error.set(null);
    const peticion =
      ed.tipo === 'nuevo' ? this.api.crearRepartidor(datos) : this.api.actualizarRepartidor(ed.repartidor.id, datos);
    peticion.subscribe({
      next: (r) => {
        this.guardando.set(false);
        this.edicion.set(null);
        this.mensaje.set(ed.tipo === 'nuevo' ? `Repartidor "${r.nombre}" creado.` : `Repartidor "${r.nombre}" actualizado.`);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  desactivar(r: Repartidor): void {
    if (!confirm(`¿Desactivar a "${r.nombre}"?`)) return;
    this.limpiarAvisos();
    this.api.desactivarRepartidor(r.id).subscribe({
      next: () => {
        this.mensaje.set(`Repartidor "${r.nombre}" desactivado.`);
        this.cargar();
      },
      // Ej: "No se puede desactivar: tiene 14 cliente(s) activo(s) asignado(s)"
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  reactivar(r: Repartidor): void {
    this.limpiarAvisos();
    this.api.actualizarRepartidor(r.id, { activo: true }).subscribe({
      next: () => {
        this.mensaje.set(`Repartidor "${r.nombre}" reactivado.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private limpiarAvisos(): void {
    this.error.set(null);
    this.mensaje.set(null);
  }
}
