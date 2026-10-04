import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Pestañas del módulo Mesón */
@Component({
  selector: 'app-meson-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="pestanas no-imprimir" aria-label="Secciones de mesón">
      @for (p of pestanas; track p.ruta) {
        <a [routerLink]="p.ruta" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: p.exacta }">{{ p.texto }}</a>
      }
    </nav>
    <router-outlet />
  `,
  styles: `
    .pestanas {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
      border-bottom: 2px solid var(--pp-borde);
      margin-bottom: 1.5rem;
    }
    .pestanas a {
      padding: 0.6rem 1rem;
      text-decoration: none;
      font-weight: 600;
      color: var(--pp-texto-suave);
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
    }
    .pestanas a:hover {
      color: var(--pp-celeste-oscuro);
    }
    .pestanas a.activa {
      color: var(--pp-celeste-oscuro);
      border-bottom-color: var(--pp-celeste);
    }
  `,
})
export class MesonLayoutComponent {
  protected readonly pestanas = [
    { ruta: '/meson', texto: 'Inicio', exacta: true },
    { ruta: '/meson/facturas', texto: 'Facturas', exacta: false },
    { ruta: '/meson/productos', texto: 'Productos', exacta: false },
    { ruta: '/meson/proveedores', texto: 'Proveedores', exacta: false },
  ];
}
