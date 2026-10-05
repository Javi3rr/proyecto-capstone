import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { mensajeError } from '../../core/errores';
import { Proveedor, ProveedorForm } from '../../core/models';
import { MesonService } from './meson.service';

type Edicion = { tipo: 'nuevo' } | { tipo: 'editar'; proveedor: Proveedor };

/** [MESÓN] Proveedores de mercadería, para asociarlos a sus facturas */
@Component({
  selector: 'app-proveedores',
  imports: [ReactiveFormsModule],
  template: `
    <header class="encabezado">
      <div>
        <h1>Proveedores</h1>
        <p class="pp-texto-suave">Empresas que entregan mercadería. Cada factura se registra a nombre de un proveedor.</p>
      </div>
      <button type="button" class="pp-btn" (click)="abrirNuevo()">+ Nuevo proveedor</button>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (edicion(); as ed) {
      <section class="pp-card formulario">
        <h2>{{ ed.tipo === 'nuevo' ? 'Nuevo proveedor' : 'Editar: ' + ed.proveedor.razonSocial }}</h2>
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="grilla-form">
            <div class="pp-campo">
              <label for="rut">RUT *</label>
              <input id="rut" formControlName="rut" placeholder="76.123.456-7" maxlength="12" />
            </div>
            <div class="pp-campo ancho">
              <label for="razon">Razón social *</label>
              <input id="razon" formControlName="razonSocial" maxlength="150" />
            </div>
            <div class="pp-campo">
              <label for="contacto">Contacto</label>
              <input id="contacto" formControlName="contacto" maxlength="120" placeholder="Nombre del vendedor" />
            </div>
            <div class="pp-campo">
              <label for="telefono">Teléfono</label>
              <input id="telefono" formControlName="telefono" maxlength="20" placeholder="+56 9 1234 5678" />
            </div>
            <div class="pp-campo">
              <label for="email">Correo</label>
              <input id="email" type="email" formControlName="email" maxlength="120" />
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
        <input type="checkbox" (change)="mostrarInactivos.set($any($event.target).checked)" /> Mostrar desactivados
      </label>
      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>RUT</th>
              <th>Razón social</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Correo</th>
              <th class="num">Facturas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of visibles(); track p.id) {
              <tr [class.inactivo]="!p.activo">
                <td class="nowrap">{{ p.rut }}</td>
                <td><strong>{{ p.razonSocial }}</strong></td>
                <td>{{ p.contacto ?? '—' }}</td>
                <td class="nowrap">{{ p.telefono ?? '—' }}</td>
                <td>{{ p.email ?? '—' }}</td>
                <td class="num">{{ p._count?.facturas ?? 0 }}</td>
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
                <td colspan="7" class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'Aún no hay proveedores registrados.' }}</td>
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
    .num {
      text-align: right;
    }
    .nowrap {
      white-space: nowrap;
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
export class ProveedoresComponent {
  private readonly api = inject(MesonService);
  private readonly fb = inject(FormBuilder);

  protected readonly proveedores = signal<Proveedor[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly edicion = signal<Edicion | null>(null);
  protected readonly mostrarInactivos = signal(false);

  protected readonly visibles = computed(() =>
    this.proveedores().filter((p) => this.mostrarInactivos() || p.activo),
  );

  protected readonly form = this.fb.group({
    rut: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(12)]),
    razonSocial: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(150)]),
    contacto: this.fb.control<string | null>(null),
    telefono: this.fb.control<string | null>(null),
    email: this.fb.control<string | null>(null, [Validators.email]),
  });

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.proveedores(true).subscribe({
      next: (data) => {
        this.proveedores.set(data);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los proveedores.'));
        this.cargando.set(false);
      },
    });
  }

  abrirNuevo(): void {
    this.limpiarAvisos();
    this.form.reset({ rut: '', razonSocial: '', contacto: null, telefono: null, email: null });
    this.edicion.set({ tipo: 'nuevo' });
  }

  abrirEditar(p: Proveedor): void {
    this.limpiarAvisos();
    this.form.reset({ rut: p.rut, razonSocial: p.razonSocial, contacto: p.contacto, telefono: p.telefono, email: p.email });
    this.edicion.set({ tipo: 'editar', proveedor: p });
  }

  guardar(): void {
    const ed = this.edicion();
    if (!ed) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('RUT y razón social son obligatorios; revise el correo si lo ingresó.');
      return;
    }
    const v = this.form.getRawValue();
    const datos: ProveedorForm = {
      rut: v.rut.trim(),
      razonSocial: v.razonSocial.trim(),
      contacto: v.contacto?.trim() || null,
      telefono: v.telefono?.trim() || null,
      email: v.email?.trim() || null,
    };

    this.guardando.set(true);
    this.error.set(null);
    const peticion =
      ed.tipo === 'nuevo' ? this.api.crearProveedor(datos) : this.api.actualizarProveedor(ed.proveedor.id, datos);
    peticion.subscribe({
      next: (p) => {
        this.guardando.set(false);
        this.edicion.set(null);
        this.mensaje.set(ed.tipo === 'nuevo' ? `Proveedor "${p.razonSocial}" creado.` : `Proveedor "${p.razonSocial}" actualizado.`);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  desactivar(p: Proveedor): void {
    if (!confirm(`¿Desactivar "${p.razonSocial}"? Se conservan sus facturas.`)) return;
    this.limpiarAvisos();
    this.api.desactivarProveedor(p.id).subscribe({
      next: () => {
        this.mensaje.set(`Proveedor "${p.razonSocial}" desactivado.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  reactivar(p: Proveedor): void {
    this.limpiarAvisos();
    this.api.actualizarProveedor(p.id, { activo: true }).subscribe({
      next: () => {
        this.mensaje.set(`Proveedor "${p.razonSocial}" reactivado.`);
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
