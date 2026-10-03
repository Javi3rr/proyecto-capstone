import { Component, input } from '@angular/core';

/**
 * Logo de Patopan: espiga de trigo + nombre.
 * Vectorial (SVG + texto), escala sin perder calidad.
 */
@Component({
  selector: 'app-logo',
  template: `
    <span class="logo" [class.logo--grande]="tamano() === 'grande'" role="img" aria-label="Panadería Patopan">
      <svg class="logo__trigo" viewBox="0 0 40 64" fill="currentColor" aria-hidden="true">
        <path d="M20 62 Q20.6 40 20 13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        <ellipse cx="20" cy="8" rx="3" ry="6.4" />
        <ellipse cx="13.6" cy="19" rx="3" ry="6.6" transform="rotate(-38 13.6 19)" />
        <ellipse cx="26.4" cy="19" rx="3" ry="6.6" transform="rotate(38 26.4 19)" />
        <ellipse cx="13.6" cy="30.5" rx="3" ry="6.6" transform="rotate(-38 13.6 30.5)" />
        <ellipse cx="26.4" cy="30.5" rx="3" ry="6.6" transform="rotate(38 26.4 30.5)" />
        <ellipse cx="13.6" cy="42" rx="3" ry="6.6" transform="rotate(-38 13.6 42)" />
        <ellipse cx="26.4" cy="42" rx="3" ry="6.6" transform="rotate(38 26.4 42)" />
      </svg>
      <span class="logo__texto">
        <span class="logo__nombre">PATOPAN</span>
        <span class="logo__sub">PANADERÍA</span>
      </span>
    </span>
  `,
  styles: `
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
    }
    .logo__trigo {
      height: 2.4rem;
      width: auto;
      color: var(--pp-celeste);
      flex-shrink: 0;
    }
    .logo__texto {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      line-height: 1;
    }
    .logo__nombre {
      font-weight: 800;
      font-size: 1.4rem;
      letter-spacing: 0.06em;
      color: var(--pp-celeste-oscuro);
    }
    .logo__sub {
      font-weight: 600;
      font-size: 0.55rem;
      letter-spacing: 0.4em;
      color: var(--pp-celeste);
    }
    .logo--grande {
      gap: 0.9rem;
    }
    .logo--grande .logo__trigo {
      height: 4.6rem;
    }
    .logo--grande .logo__nombre {
      font-size: 2.6rem;
    }
    .logo--grande .logo__sub {
      font-size: 0.8rem;
      letter-spacing: 0.42em;
    }
  `,
})
export class LogoComponent {
  readonly tamano = input<'chico' | 'grande'>('chico');
}
