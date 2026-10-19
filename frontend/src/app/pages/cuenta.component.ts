import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { mensajeError } from '../core/errores';
import { REGLA_CLAVE } from '../core/models';

/** Cambio de contraseña del propio usuario (cualquier rol) */
@Component({
  selector: 'app-cuenta',
  template: `
    <section class="pp-card caja">
      <h1>Mi contraseña</h1>
      <p class="pp-texto-suave">
        Usuario: <strong>{{ auth.usuario()?.username }}</strong>. Al cambiarla se cierran sus sesiones en otros equipos.
      </p>

      @if (mensaje()) {
        <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
      }
      @if (error()) {
        <p class="pp-alerta-error" role="alert">{{ error() }}</p>
      }

      <form (submit)="$event.preventDefault(); guardar(actual.value, nueva.value, repetir.value)" novalidate>
        <div class="pp-campo">
          <label for="actual">Contraseña actual</label>
          <input #actual id="actual" type="password" autocomplete="current-password" />
        </div>
        <div class="pp-campo">
          <label for="nueva">Nueva contraseña</label>
          <input #nueva id="nueva" type="password" autocomplete="new-password" />
          <small class="pp-texto-suave">Mínimo 8 caracteres, con letras y números.</small>
        </div>
        <div class="pp-campo">
          <label for="repetir">Repetir nueva contraseña</label>
          <input #repetir id="repetir" type="password" autocomplete="new-password" />
        </div>
        <button type="submit" class="pp-btn" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Cambiar contraseña' }}</button>
      </form>
    </section>
  `,
  styles: `
    .caja {
      max-width: 460px;
      margin: 1rem auto;
    }
    .caja p {
      margin-top: 0;
    }
    form .pp-btn {
      width: 100%;
    }
  `,
})
export class CuentaComponent {
  protected readonly auth = inject(AuthService);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  guardar(actual: string, nueva: string, repetir: string): void {
    this.error.set(null);
    this.mensaje.set(null);
    if (!actual) return this.error.set('Ingrese su contraseña actual.');
    if (!REGLA_CLAVE.test(nueva)) return this.error.set('La nueva contraseña debe tener al menos 8 caracteres, con letras y números.');
    if (nueva !== repetir) return this.error.set('Las contraseñas nuevas no coinciden.');

    this.guardando.set(true);
    this.auth.cambiarClave(actual, nueva).subscribe({
      next: () => {
        this.guardando.set(false);
        this.mensaje.set('Contraseña actualizada.');
        (document.querySelectorAll('app-cuenta input[type=password]') as NodeListOf<HTMLInputElement>).forEach(
          (i) => (i.value = ''),
        );
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      },
    });
  }
}
