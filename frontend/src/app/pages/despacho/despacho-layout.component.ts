import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Pestañas del módulo Despacho */
@Component({
  selector: 'app-despacho-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="pestanas no-imprimir" aria-label="Secciones de despacho">
      @for (p of pestanas; track p.ruta) {
        <a [routerLink]="p.ruta" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: p.exacta }">
          {{ p.texto }}
        </a>
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
export class DespachoLayoutComponent {
  protected readonly pestanas = [
    { ruta: '/despacho', texto: 'Inicio', exacta: true },
    { ruta: '/despacho/planilla', texto: 'Planilla del día', exacta: false },
    { ruta: '/despacho/guias', texto: 'Guías', exacta: false },
    { ruta: '/despacho/entrega', texto: 'Entrega del día', exacta: false },
    { ruta: '/despacho/historial', texto: 'Historial', exacta: false },
    { ruta: '/despacho/promedios', texto: 'Promedios', exacta: false },
    { ruta: '/despacho/clientes', texto: 'Clientes', exacta: false },
    { ruta: '/despacho/repartidores', texto: 'Repartidores', exacta: false },
    { ruta: '/despacho/precios', texto: 'Precio del kg', exacta: false },
  ];
}
