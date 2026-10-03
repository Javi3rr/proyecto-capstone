import { Component, input } from '@angular/core';

/** Logo de Patopan recreado en CSS (escala sin perder calidad) */
@Component({
  selector: 'app-logo',
  template: `
    <div class="logo" [class.logo--grande]="tamano() === 'grande'" role="img" aria-label="Panadería Patopan">
      <span class="logo__script">Panadería</span>
      <span class="logo__banda">PATOPAN</span>
    </div>
  `,
  styles: `
    .logo {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      line-height: 1;
    }
    .logo__script {
      font-family: var(--pp-fuente-script);
      color: var(--pp-celeste);
      font-size: 1.35rem;
      margin-bottom: -0.1rem;
    }
    .logo__banda {
      background: var(--pp-celeste);
      color: var(--pp-blanco);
      font-weight: 800;
      letter-spacing: 0.3em;
      padding: 0.3rem 0.6rem 0.3rem 0.9rem;
      font-size: 0.95rem;
    }
    .logo--grande .logo__script {
      font-size: 2.6rem;
      margin-bottom: 0.1rem;
    }
    .logo--grande .logo__banda {
      font-size: 1.8rem;
      padding: 0.55rem 1.5rem 0.55rem 2rem;
    }
  `,
})
export class LogoComponent {
  readonly tamano = input<'chico' | 'grande'>('chico');
}
