import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/errores';
import { NOMBRE_ROL, REGLA_CLAVE, Rol, UsuarioAdmin, UsuarioForm } from '../../core/models';

type Edicion = { tipo: 'nuevo' } | { tipo: 'editar'; usuario: UsuarioAdmin } | { tipo: 'clave'; usuario: UsuarioAdmin };

const DESCRIPCION_ROL: Record<Rol, string> = {
  ADMIN: 'Ve ambos módulos, reportes, auditoría y usuarios',
  DESPACHO: 'Planilla, guías, entrega del día y clientes',
  MESON: 'Facturas, productos, stock y conteos',
};

/** [TRANSVERSAL] Gestión de usuarios del personal (solo administrador) */
@Component({
  selector: 'app-usuarios',
  imports: [DatePipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <a routerLink="/admin" class="volver">← Administración</a>
        <h1>Usuarios</h1>
        <p class="pp-texto-suave">
          Desactivar, cambiar el rol o restablecer la contraseña cierra de inmediato las sesiones abiertas de ese usuario.
        </p>
      </div>
      <button type="button" class="pp-btn" (click)="abrirNuevo()">+ Nuevo usuario</button>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (edicion(); as ed) {
      <section class="pp-card formulario">
        @if (ed.tipo === 'clave') {
          <h2>Restablecer contraseña de {{ ed.usuario.username }}</h2>
          <form (submit)="$event.preventDefault(); restablecer(ed.usuario, clave1.value, clave2.value)" novalidate>
            <div class="grilla-form">
              <div class="pp-campo">
                <label for="c1">Nueva contraseña</label>
                <input #clave1 id="c1" type="password" autocomplete="new-password" />
                <small class="pp-texto-suave">Mínimo 8 caracteres, con letras y números. Entréguela al usuario en persona.</small>
              </div>
              <div class="pp-campo">
                <label for="c2">Repetir contraseña</label>
                <input #clave2 id="c2" type="password" autocomplete="new-password" />
              </div>
            </div>
            <div class="acciones">
              <button type="button" class="pp-btn pp-btn--secundario" (click)="edicion.set(null)">Cancelar</button>
              <button type="submit" class="pp-btn" [disabled]="guardando()">Restablecer</button>
            </div>
          </form>
        } @else {
          <h2>{{ ed.tipo === 'nuevo' ? 'Nuevo usuario' : 'Editar: ' + ed.usuario.username }}</h2>
          <form (submit)="$event.preventDefault(); guardar(username.value, nombre.value, rol.value, codigo.value)" novalidate>
            <div class="grilla-form">
              <div class="pp-campo">
                <label for="username">Usuario (para ingresar) *</label>
                <input
                  #username
                  id="username"
                  maxlength="50"
                  autocomplete="off"
                  placeholder="Ej. maria.p"
                  [value]="ed.tipo === 'editar' ? ed.usuario.username : ''"
                  [disabled]="ed.tipo === 'editar'"
                />
                @if (ed.tipo === 'editar') {
                  <small class="pp-texto-suave">El nombre de usuario no se cambia (queda en la auditoría).</small>
                }
              </div>
              <div class="pp-campo">
                <label for="nombre">Nombre completo *</label>
                <input #nombre id="nombre" maxlength="120" [value]="ed.tipo === 'editar' ? ed.usuario.nombre : ''" />
              </div>
              <div class="pp-campo">
                <label for="rol">Rol *</label>
                <select #rol id="rol" [value]="rolForm()" (change)="rolForm.set($any($event.target).value)" [disabled]="esYo(ed)">
                  @for (r of roles; track r) {
                    <option [value]="r">{{ nombreRol[r] }}</option>
                  }
                </select>
                <small class="pp-texto-suave">{{ descripcionRol[rolForm()] }}</small>
              </div>
              <div class="pp-campo">
                <label for="codigo">Código de mesonera</label>
                <input #codigo id="codigo" maxlength="20" placeholder="El que imprime la balanza" [value]="ed.tipo === 'editar' ? (ed.usuario.codigo ?? '') : ''" />
                <small class="pp-texto-suave">{{ rolForm() === 'MESON' ? 'Para cruzar las ventas de la balanza con cada mesonera.' : 'Opcional.' }}</small>
              </div>
              @if (ed.tipo === 'nuevo') {
                <div class="pp-campo">
                  <label for="clave">Contraseña inicial *</label>
                  <input id="clave" type="password" autocomplete="new-password" (input)="claveNueva.set($any($event.target).value)" />
                  <small class="pp-texto-suave">Mínimo 8 caracteres, con letras y números.</small>
                </div>
                <div class="pp-campo">
                  <label for="claveRep">Repetir contraseña *</label>
                  <input id="claveRep" type="password" autocomplete="new-password" (input)="claveRepetida.set($any($event.target).value)" />
                </div>
              }
            </div>
            <div class="acciones">
              <button type="button" class="pp-btn pp-btn--secundario" (click)="edicion.set(null)">Cancelar</button>
              <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        }
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
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Código mesonera</th>
              <th>Último acceso</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (u of visibles(); track u.id) {
              <tr [class.inactivo]="!u.activo">
                <td>
                  <strong>{{ u.username }}</strong>
                  @if (u.id === miId()) {
                    <span class="pp-chip yo">usted</span>
                  }
                </td>
                <td>{{ u.nombre }}</td>
                <td><span class="rol" [attr.data-rol]="u.rol">{{ nombreRol[u.rol] }}</span></td>
                <td>{{ u.codigo ?? '—' }}</td>
                <td class="nowrap">{{ u.ultimoAcceso ? (u.ultimoAcceso | date: 'dd-MM-yyyy HH:mm') : 'Nunca' }}</td>
                <td>{{ u.activo ? 'Activo' : 'Desactivado' }}</td>
                <td class="botones">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="abrirEditar(u)">Editar</button>
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="abrirClave(u)">Contraseña</button>
                  @if (u.id !== miId()) {
                    @if (u.activo) {
                      <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="cerrarSesiones(u)" title="Obliga a volver a iniciar sesión">Cerrar sesiones</button>
                      <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="cambiarEstado(u, false)">Desactivar</button>
                    } @else {
                      <button type="button" class="pp-btn pp-btn--chico" (click)="cambiarEstado(u, true)">Reactivar</button>
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="pp-texto-suave">{{ cargando() ? 'Cargando…' : 'No hay usuarios.' }}</td></tr>
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
    .volver {
      font-size: 0.85rem;
      text-decoration: none;
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
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
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
    .nowrap {
      white-space: nowrap;
    }
    .botones {
      white-space: nowrap;
      text-align: right;
    }
    .botones button + button {
      margin-left: 0.3rem;
    }
    tr.inactivo td {
      color: var(--pp-texto-suave);
    }
    .yo {
      margin-left: 0.35rem;
    }
    .rol {
      display: inline-block;
      padding: 0.05rem 0.55rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      background: var(--pp-celeste-claro);
      color: var(--pp-celeste-oscuro);
    }
    .rol[data-rol='ADMIN'] {
      background: #efe7fb;
      color: #6b3fb5;
    }
    .rol[data-rol='MESON'] {
      background: #e3f6ea;
      color: var(--pp-exito);
    }
  `,
})
export class UsuariosComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  protected readonly roles: Rol[] = ['DESPACHO', 'MESON', 'ADMIN'];
  protected readonly nombreRol = NOMBRE_ROL;
  protected readonly descripcionRol = DESCRIPCION_ROL;

  protected readonly usuarios = signal<UsuarioAdmin[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly edicion = signal<Edicion | null>(null);
  protected readonly mostrarInactivos = signal(false);
  protected readonly rolForm = signal<Rol>('DESPACHO');
  protected readonly claveNueva = signal('');
  protected readonly claveRepetida = signal('');

  protected readonly miId = computed(() => this.auth.usuario()?.id ?? null);
  protected readonly visibles = computed(() => this.usuarios().filter((u) => this.mostrarInactivos() || u.activo));

  constructor() {
    this.cargar();
  }

  protected esYo(ed: Edicion): boolean {
    return ed.tipo === 'editar' && ed.usuario.id === this.miId();
  }

  cargar(): void {
    this.cargando.set(true);
    this.http.get<UsuarioAdmin[]>('/api/usuarios').subscribe({
      next: (u) => {
        this.usuarios.set(u);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar los usuarios.'));
        this.cargando.set(false);
      },
    });
  }

  abrirNuevo(): void {
    this.limpiar();
    this.rolForm.set('DESPACHO');
    this.edicion.set({ tipo: 'nuevo' });
  }

  abrirEditar(u: UsuarioAdmin): void {
    this.limpiar();
    this.rolForm.set(u.rol);
    this.edicion.set({ tipo: 'editar', usuario: u });
  }

  abrirClave(u: UsuarioAdmin): void {
    this.limpiar();
    this.edicion.set({ tipo: 'clave', usuario: u });
  }

  guardar(username: string, nombre: string, rol: string, codigo: string): void {
    const clave = this.claveNueva();
    const claveRep = this.claveRepetida();
    const ed = this.edicion();
    if (!ed || ed.tipo === 'clave') return;
    this.error.set(null);
    this.mensaje.set(null);

    const datos: UsuarioForm = {
      nombre: nombre.trim(),
      rol: rol as Rol,
      codigo: codigo.trim() || null,
    };
    if (!datos.nombre) return this.error.set('El nombre es obligatorio.');

    if (ed.tipo === 'nuevo') {
      const user = username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,50}$/.test(user)) {
        return this.error.set('Usuario: 3 a 50 caracteres, solo minúsculas, números, punto, guion o guion bajo (sin espacios).');
      }
      if (!REGLA_CLAVE.test(clave)) return this.error.set('La contraseña debe tener al menos 8 caracteres, con letras y números.');
      if (clave !== claveRep) return this.error.set('Las contraseñas no coinciden.');
      datos.username = user;
      datos.password = clave;
    } else if (this.esYo(ed)) {
      // No se puede cambiar el propio rol: se envía sin rol
      delete (datos as Partial<UsuarioForm>).rol;
    }

    this.guardando.set(true);
    const peticion =
      ed.tipo === 'nuevo'
        ? this.http.post<UsuarioAdmin>('/api/usuarios', datos)
        : this.http.patch<UsuarioAdmin>(`/api/usuarios/${ed.usuario.id}`, datos);
    peticion.subscribe({
      next: (u) => {
        this.guardando.set(false);
        this.edicion.set(null);
        this.mensaje.set(
          ed.tipo === 'nuevo'
            ? `Usuario "${u.username}" creado. Entréguele su contraseña en persona.`
            : `Usuario "${u.username}" actualizado.`,
        );
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  restablecer(u: UsuarioAdmin, clave1: string, clave2: string): void {
    this.limpiar();
    if (!REGLA_CLAVE.test(clave1)) return this.error.set('La contraseña debe tener al menos 8 caracteres, con letras y números.');
    if (clave1 !== clave2) return this.error.set('Las contraseñas no coinciden.');
    const esYo = u.id === this.miId();
    if (!confirm(`¿Restablecer la contraseña de "${u.username}"? ${esYo ? 'Deberá volver a iniciar sesión.' : 'Se cerrarán sus sesiones abiertas.'}`)) return;

    this.guardando.set(true);
    this.http.post(`/api/usuarios/${u.id}/clave`, { password: clave1 }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.edicion.set(null);
        if (esYo) {
          this.auth.logout();
          return;
        }
        this.mensaje.set(`Contraseña de "${u.username}" restablecida. Entréguela en persona.`);
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }

  cambiarEstado(u: UsuarioAdmin, activo: boolean): void {
    if (!activo && !confirm(`¿Desactivar a "${u.username}"? No podrá ingresar y se cerrarán sus sesiones. Su historial se conserva.`)) return;
    this.limpiar();
    this.http.patch<UsuarioAdmin>(`/api/usuarios/${u.id}`, { activo }).subscribe({
      next: () => {
        this.mensaje.set(`Usuario "${u.username}" ${activo ? 'reactivado' : 'desactivado'}.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  cerrarSesiones(u: UsuarioAdmin): void {
    if (!confirm(`¿Cerrar todas las sesiones abiertas de "${u.username}"? Tendrá que volver a ingresar.`)) return;
    this.limpiar();
    this.http.post(`/api/usuarios/${u.id}/cerrar-sesiones`, {}).subscribe({
      next: () => this.mensaje.set(`Sesiones de "${u.username}" cerradas.`),
      error: (e) => this.error.set(mensajeError(e)),
    });
  }

  private limpiar(): void {
    this.claveNueva.set('');
    this.claveRepetida.set('');
    this.error.set(null);
    this.mensaje.set(null);
  }
}
