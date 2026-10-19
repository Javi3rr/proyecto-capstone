import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LogoComponent } from '../../layout/logo.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, LogoComponent],
  template: `
    <div class="pantalla">
      <section class="pp-card tarjeta">
        <div class="tarjeta__logo"><app-logo [tamano]="'grande'" /></div>
        <h1>Ingreso al sistema</h1>
        <p class="pp-texto-suave">Use el usuario de su sección (Mesón o Despacho).</p>

        <form [formGroup]="form" (ngSubmit)="ingresar()" novalidate>
          <div class="pp-campo">
            <label for="username">Usuario</label>
            <input id="username" type="text" formControlName="username" autocomplete="username" autocapitalize="none" />
          </div>
          <div class="pp-campo">
            <label for="password">Contraseña</label>
            <input id="password" type="password" formControlName="password" autocomplete="current-password" />
          </div>

          @if (error()) {
            <p class="pp-alerta-error" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="pp-btn ingresar" [disabled]="cargando()">
            {{ cargando() ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: `
    .pantalla {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: linear-gradient(180deg, var(--pp-blanco) 0%, var(--pp-celeste-claro) 100%);
    }
    .tarjeta {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
    }
    .tarjeta__logo {
      display: flex;
      justify-content: center;
      margin-bottom: 1.5rem;
    }
    h1 {
      font-size: 1.3rem;
      text-align: center;
    }
    p {
      text-align: center;
      margin-top: 0;
    }
    .ingresar {
      width: 100%;
      margin-top: 0.5rem;
    }
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  ingresar(): void {
    if (this.form.invalid) {
      this.error.set('Ingrese usuario y contraseña');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);

    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.rutaInicio()),
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          e.status === 401
            ? 'Usuario o contraseña incorrectos'
            : 'No se pudo conectar con el servidor. Intente nuevamente.',
        );
      },
    });
  }
}
