import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { NOMBRE_ROL, Rol } from '../core/models';
import { LogoComponent } from './logo.component';

interface ItemMenu {
  ruta: string;
  texto: string;
  roles: Rol[];
}

const MENU: ItemMenu[] = [
  { ruta: '/admin', texto: 'Administración', roles: ['ADMIN'] },
  { ruta: '/despacho', texto: 'Despacho', roles: ['DESPACHO'] },
  { ruta: '/meson', texto: 'Mesón', roles: ['MESON'] },
];

/** Estructura común de todas las pantallas internas: encabezado + menú por rol + contenido */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent],
  template: `
    <header class="barra">
      <a routerLink="/" class="barra__logo" aria-label="Inicio"><app-logo /></a>

      <nav class="barra__menu" aria-label="Secciones">
        @for (item of menu(); track item.ruta) {
          <a [routerLink]="item.ruta" routerLinkActive="activo">{{ item.texto }}</a>
        }
      </nav>

      @if (auth.usuario(); as u) {
        <div class="barra__usuario">
          <div class="barra__datos">
            <strong>{{ u.nombre }}</strong>
            <span class="pp-chip">{{ nombreRol[u.rol] }}</span>
          </div>
          <a routerLink="/cuenta" class="cuenta" title="Cambiar mi contraseña">Mi contraseña</a>
          <button type="button" class="pp-btn pp-btn--secundario" (click)="auth.logout()">Salir</button>
        </div>
      }
    </header>

    <main class="contenido">
      <router-outlet />
    </main>
  `,
  styles: `
    .barra {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
      padding: 0.6rem 1.5rem;
      background: var(--pp-blanco);
      border-bottom: 3px solid var(--pp-celeste);
      box-shadow: var(--pp-sombra);
    }
    .barra__logo {
      text-decoration: none;
    }
    .barra__menu {
      display: flex;
      gap: 0.25rem;
      flex: 1;
      flex-wrap: wrap;
    }
    .barra__menu a {
      padding: 0.5rem 0.9rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      color: var(--pp-texto-suave);
    }
    .barra__menu a:hover {
      background: var(--pp-celeste-claro);
    }
    .barra__menu a.activo {
      background: var(--pp-celeste-claro);
      color: var(--pp-celeste-oscuro);
    }
    .barra__usuario {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .cuenta {
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }
    .barra__datos {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: 0.85rem;
    }
    .contenido {
      max-width: 1200px;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
    }
    @media (max-width: 640px) {
      .barra {
        padding: 0.6rem 1rem;
        gap: 0.75rem;
      }
      .barra__datos {
        display: none;
      }
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly nombreRol = NOMBRE_ROL;

  protected readonly menu = computed(() => {
    const u = this.auth.usuario();
    if (!u) return [];
    return MENU.filter((m) => u.rol === 'ADMIN' || m.roles.includes(u.rol));
  });
}
