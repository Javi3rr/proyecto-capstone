import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-no-autorizado',
  imports: [RouterLink],
  template: `
    <section class="pp-card">
      <h1>Sin acceso a esta sección</h1>
      <p class="pp-texto-suave">Su usuario no tiene permisos para ver esta página.</p>
      <a class="pp-btn" [routerLink]="auth.rutaInicio()">Volver a mi inicio</a>
    </section>
  `,
})
export class NoAutorizadoComponent {
  protected readonly auth = inject(AuthService);
}
