import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { mensajeError } from '../../core/errores';
import { Cliente, ClienteForm, ModalidadCliente, NOMBRE_MODALIDAD, Repartidor } from '../../core/models';
import { DespachoService } from './despacho.service';

type Edicion = { tipo: 'nuevo' } | { tipo: 'editar'; cliente: Cliente };

/** [DESPACHO] Crear, modificar y eliminar (desactivar) clientes, con su ruta y precio especial */
@Component({
  selector: 'app-clientes',
  imports: [ReactiveFormsModule, CurrencyPipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <div>
        <h1>Clientes</h1>
        <p class="pp-texto-suave">
          Precio general vigente:
          <strong>{{ precioGeneral() === null ? 'sin definir' : (precioGeneral()! | currency: 'CLP' : 'symbol-narrow' : '1.0-0') }}</strong>
          por kg
        </p>
      </div>
      <button type="button" class="pp-btn" (click)="abrirNuevo()">+ Nuevo cliente</button>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (edicion(); as ed) {
      <section class="pp-card formulario">
        <h2>{{ ed.tipo === 'nuevo' ? 'Nuevo cliente' : 'Editar: ' + ed.cliente.nombre }}</h2>
        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="grilla-form">
            <div class="pp-campo">
              <label for="nombre">Nombre *</label>
              <input id="nombre" formControlName="nombre" maxlength="120" />
            </div>
            <div class="pp-campo">
              <label for="modalidad">Modalidad *</label>
              <select id="modalidad" formControlName="modalidad">
                @for (m of modalidades; track m) {
                  <option [ngValue]="m">{{ nombreModalidad[m] }}</option>
                }
              </select>
            </div>
            <div class="pp-campo">
              <label for="repartidor">Repartidor {{ form.controls.modalidad.value === 'PRESENCIAL' ? '' : '*' }}</label>
              <select id="repartidor" formControlName="repartidorId">
                <option [ngValue]="null">{{ form.controls.modalidad.value === 'PRESENCIAL' ? 'No aplica (presencial)' : 'Seleccione…' }}</option>
                @for (r of repartidoresActivos(); track r.id) {
                  <option [ngValue]="r.id">{{ r.nombre }}</option>
                }
              </select>
            </div>
            @if (form.controls.modalidad.value === 'PAGO_DIA_SIGUIENTE') {
              <div class="pp-campo">
                <label for="cobrador">Quién cobra el pago del día siguiente</label>
                <select id="cobrador" formControlName="cobradorId">
                  <option [ngValue]="null">El mismo repartidor</option>
                  @for (r of repartidoresActivos(); track r.id) {
                    <option [ngValue]="r.id">{{ r.nombre }}</option>
                  }
                </select>
              </div>
            }
            <div class="pp-campo">
              <label for="precio">Precio especial por kg</label>
              <input id="precio" type="number" min="1" step="1" formControlName="precioKgEspecial" placeholder="Vacío = precio general" />
            </div>
            <div class="pp-campo">
              <label for="descuento">Kg de descuento diario</label>
              <input id="descuento" type="number" min="0" step="0.1" formControlName="kgDescuentoDiario" />
            </div>
            <div class="pp-campo">
              <label for="orden">Orden en la planilla</label>
              <input id="orden" type="number" min="0" step="1" formControlName="orden" placeholder="Vacío = al final" />
            </div>
            <div class="pp-campo">
              <label for="direccion">Dirección</label>
              <input id="direccion" formControlName="direccion" maxlength="200" />
            </div>
            <div class="pp-campo">
              <label for="telefono">Teléfono</label>
              <input id="telefono" formControlName="telefono" maxlength="20" />
            </div>
            <p class="subtitulo-sii">Datos tributarios (para la guía de despacho electrónica del SII)</p>
            <div class="pp-campo">
              <label for="rut">RUT</label>
              <input id="rut" formControlName="rut" maxlength="12" placeholder="12.345.678-9" />
            </div>
            <div class="pp-campo">
              <label for="razon">Razón social</label>
              <input id="razon" formControlName="razonSocial" maxlength="100" placeholder="Vacío = nombre del cliente" />
            </div>
            <div class="pp-campo">
              <label for="giro">Giro</label>
              <input id="giro" formControlName="giro" maxlength="80" placeholder="Ej. Minimarket" />
            </div>
            <div class="pp-campo">
              <label for="comuna">Comuna</label>
              <input id="comuna" formControlName="comuna" maxlength="40" />
            </div>
          </div>
          <div class="acciones">
            <button type="button" class="pp-btn pp-btn--secundario" (click)="cerrarFormulario()">Cancelar</button>
            <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </section>
    }

    <section class="pp-card">
      <div class="filtros">
        <div class="pp-campo">
          <label for="buscar">Buscar</label>
          <input id="buscar" #b type="search" placeholder="Nombre del cliente" (input)="buscar.set(b.value)" />
        </div>
        <div class="pp-campo">
          <label for="filtro-modalidad">Modalidad</label>
          <select id="filtro-modalidad" #m (change)="filtroModalidad.set(m.value)">
            <option value="">Todas</option>
            @for (mod of modalidades; track mod) {
              <option [value]="mod">{{ nombreModalidad[mod] }}</option>
            }
          </select>
        </div>
        <label class="check">
          <input type="checkbox" #ch (change)="mostrarInactivos.set(ch.checked)" /> Mostrar desactivados
        </label>
      </div>

      @if (cargando()) {
        <p class="pp-texto-suave">Cargando…</p>
      } @else {
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Orden</th>
                <th>Nombre</th>
                <th>Modalidad</th>
                <th>Repartidor</th>
                <th>Precio kg</th>
                <th>Desc. diario</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of filtrados(); track c.id) {
                <tr [class.inactivo]="!c.activo">
                  <td>{{ c.orden }}</td>
                  <td>
                    <strong>{{ c.nombre }}</strong>
                    @if (c.rut) {
                      <small class="cobra">RUT {{ c.rut }}</small>
                    }
                  </td>
                  <td>{{ nombreModalidad[c.modalidad] }}</td>
                  <td>
                    {{ c.repartidor?.nombre ?? '—' }}
                    @if (c.cobrador) {
                      <small class="cobra">Cobra: {{ c.cobrador.nombre }}</small>
                    }
                  </td>
                  <td>
                    @if (c.precioKgEspecial !== null) {
                      {{ num(c.precioKgEspecial) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                      <span class="pp-chip">especial</span>
                    } @else if (precioGeneral() !== null) {
                      {{ precioGeneral()! | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}
                    } @else {
                      —
                    }
                  </td>
                  <td>{{ num(c.kgDescuentoDiario) > 0 ? (num(c.kgDescuentoDiario) | number: '1.0-3') + ' kg' : '—' }}</td>
                  <td>{{ c.activo ? 'Activo' : 'Desactivado' }}</td>
                  <td class="botones">
                    <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="abrirEditar(c)">Editar</button>
                    @if (c.activo) {
                      <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="desactivar(c)">Desactivar</button>
                    } @else {
                      <button type="button" class="pp-btn pp-btn--chico" (click)="reactivar(c)">Reactivar</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="pp-texto-suave">No hay clientes que coincidan con el filtro.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="pp-texto-suave total">{{ filtrados().length }} cliente(s)</p>
      }
    </section>
  `,
  styles: `
    .subtitulo-sii {
      grid-column: 1 / -1;
      margin: 0.5rem 0 0;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--pp-celeste-oscuro);
    }
    .cobra {
      display: block;
      font-size: 0.75rem;
      color: var(--pp-celeste-oscuro);
    }
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
    .filtros {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    .filtros .pp-campo {
      min-width: 200px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 1.4rem;
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
      text-decoration: line-through;
    }
    tr.inactivo td.botones {
      text-decoration: none;
    }
    .total {
      margin: 0.5rem 0 0;
      font-size: 0.85rem;
    }
  `,
})
export class ClientesComponent {
  private readonly api = inject(DespachoService);
  private readonly fb = inject(FormBuilder);

  protected readonly nombreModalidad = NOMBRE_MODALIDAD;
  protected readonly modalidades: ModalidadCliente[] = ['REPARTO', 'PAGO_DIA_SIGUIENTE', 'PRESENCIAL'];

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly repartidores = signal<Repartidor[]>([]);
  protected readonly precioGeneral = signal<number | null>(null);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly edicion = signal<Edicion | null>(null);

  protected readonly buscar = signal('');
  protected readonly filtroModalidad = signal('');
  protected readonly mostrarInactivos = signal(false);

  protected readonly repartidoresActivos = computed(() => this.repartidores().filter((r) => r.activo));

  protected readonly filtrados = computed(() => {
    const texto = this.buscar().trim().toLowerCase();
    const modalidad = this.filtroModalidad();
    return this.clientes().filter(
      (c) =>
        (this.mostrarInactivos() || c.activo) &&
        (!modalidad || c.modalidad === modalidad) &&
        (!texto || c.nombre.toLowerCase().includes(texto)),
    );
  });

  protected readonly form = this.fb.group({
    nombre: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    modalidad: this.fb.nonNullable.control<ModalidadCliente>('REPARTO'),
    repartidorId: this.fb.control<number | null>(null),
    cobradorId: this.fb.control<number | null>(null),
    precioKgEspecial: this.fb.control<number | null>(null, [Validators.min(1)]),
    kgDescuentoDiario: this.fb.control<number | null>(0, [Validators.min(0)]),
    orden: this.fb.control<number | null>(null, [Validators.min(0)]),
    direccion: this.fb.control<string | null>(null),
    telefono: this.fb.control<string | null>(null),
    rut: this.fb.control<string | null>(null),
    razonSocial: this.fb.control<string | null>(null),
    giro: this.fb.control<string | null>(null),
    comuna: this.fb.control<string | null>(null),
  });

  constructor() {
    // Presencial no lleva repartidor
    this.form.controls.modalidad.valueChanges.pipe(takeUntilDestroyed()).subscribe((m) => {
      const ctrl = this.form.controls.repartidorId;
      if (m === 'PRESENCIAL') {
        ctrl.setValue(null);
        ctrl.disable();
      } else {
        ctrl.enable();
      }
    });
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  cargar(): void {
    this.cargando.set(true);
    forkJoin({
      clientes: this.api.clientes(true),
      repartidores: this.api.repartidores(true),
      precio: this.api.precioVigente(),
    }).subscribe({
      next: ({ clientes, repartidores, precio }) => {
        this.clientes.set(clientes);
        this.repartidores.set(repartidores);
        this.precioGeneral.set(precio ? Number(precio.valor) : null);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los clientes.'));
        this.cargando.set(false);
      },
    });
  }

  abrirNuevo(): void {
    this.limpiarAvisos();
    this.form.reset({
      nombre: '',
      modalidad: 'REPARTO',
      repartidorId: null,
      cobradorId: null,
      precioKgEspecial: null,
      kgDescuentoDiario: 0,
      orden: null,
      direccion: null,
      telefono: null,
      rut: null,
      razonSocial: null,
      giro: null,
      comuna: null,
    });
    this.edicion.set({ tipo: 'nuevo' });
  }

  abrirEditar(c: Cliente): void {
    this.limpiarAvisos();
    this.form.reset({
      nombre: c.nombre,
      modalidad: c.modalidad,
      repartidorId: c.repartidorId,
      cobradorId: c.cobradorId,
      precioKgEspecial: c.precioKgEspecial === null ? null : Number(c.precioKgEspecial),
      kgDescuentoDiario: Number(c.kgDescuentoDiario),
      orden: c.orden,
      direccion: c.direccion,
      telefono: c.telefono,
      rut: c.rut,
      razonSocial: c.razonSocial,
      giro: c.giro,
      comuna: c.comuna,
    });
    this.edicion.set({ tipo: 'editar', cliente: c });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cerrarFormulario(): void {
    this.edicion.set(null);
  }

  guardar(): void {
    const ed = this.edicion();
    if (!ed) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revise los datos del formulario (el nombre es obligatorio y los valores no pueden ser negativos).');
      return;
    }

    const v = this.form.getRawValue();
    const datos: ClienteForm = {
      nombre: v.nombre.trim(),
      modalidad: v.modalidad,
      repartidorId: v.modalidad === 'PRESENCIAL' ? null : v.repartidorId,
      cobradorId: v.modalidad === 'PAGO_DIA_SIGUIENTE' ? v.cobradorId : null,
      precioKgEspecial: v.precioKgEspecial ?? null,
      kgDescuentoDiario: v.kgDescuentoDiario ?? 0,
      direccion: v.direccion?.trim() || null,
      telefono: v.telefono?.trim() || null,
      rut: v.rut?.trim() || null,
      razonSocial: v.razonSocial?.trim() || null,
      giro: v.giro?.trim() || null,
      comuna: v.comuna?.trim() || null,
      ...(v.orden !== null ? { orden: v.orden } : {}),
    };

    this.guardando.set(true);
    this.error.set(null);
    const peticion =
      ed.tipo === 'nuevo' ? this.api.crearCliente(datos) : this.api.actualizarCliente(ed.cliente.id, datos);

    peticion.subscribe({
      next: (c) => {
        this.guardando.set(false);
        this.edicion.set(null);
        this.mensaje.set(ed.tipo === 'nuevo' ? `Cliente "${c.nombre}" creado.` : `Cliente "${c.nombre}" actualizado.`);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  desactivar(c: Cliente): void {
    if (!confirm(`¿Desactivar a "${c.nombre}"?\nDejará de aparecer en la planilla, pero se conserva su historial.`)) return;
    this.limpiarAvisos();
    this.api.desactivarCliente(c.id).subscribe({
      next: () => {
        this.mensaje.set(`Cliente "${c.nombre}" desactivado.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  reactivar(c: Cliente): void {
    this.limpiarAvisos();
    this.api.actualizarCliente(c.id, { activo: true }).subscribe({
      next: () => {
        this.mensaje.set(`Cliente "${c.nombre}" reactivado.`);
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
