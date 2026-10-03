import { Component } from '@angular/core';

interface Funcion {
  titulo: string;
  descripcion: string;
}

/** Inicio de Mesón. Base para facturas de mercadería, inventario e integración con balanzas. */
@Component({
  selector: 'app-meson-inicio',
  template: `
    <header class="encabezado">
      <h1>Mesón</h1>
      <p class="pp-texto-suave">Facturas de mercadería, inventario y trazabilidad del stock.</p>
    </header>

    <div class="grilla">
      @for (f of funciones; track f.titulo) {
        <section class="pp-card funcion">
          <span class="pp-chip">Próximamente</span>
          <h2>{{ f.titulo }}</h2>
          <p class="pp-texto-suave">{{ f.descripcion }}</p>
        </section>
      }
    </div>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1.25rem;
    }
    .encabezado p {
      margin: 0;
    }
    .grilla {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }
    .funcion h2 {
      font-size: 1.05rem;
      margin-top: 0.75rem;
      color: var(--pp-celeste-oscuro);
    }
    .funcion p {
      margin: 0;
      font-size: 0.9rem;
    }
  `,
})
export class MesonInicioComponent {
  protected readonly funciones: Funcion[] = [
    { titulo: 'Facturas de mercadería', descripcion: 'Registrar facturas de proveedores con su foto o PDF.' },
    { titulo: 'Productos', descripcion: 'Catálogo de pan, cecinas y mercadería con código PLU de la balanza.' },
    { titulo: 'Stock', descripcion: 'Stock actual con alertas de stock bajo.' },
    { titulo: 'Ventas de balanzas', descripcion: 'Importar el Excel de las balanzas para descontar lo vendido.' },
    { titulo: 'Conteos y ajustes', descripcion: 'Comparar conteo físico vs. stock esperado (robo hormiga).' },
    { titulo: 'Historial (kardex)', descripcion: 'Todas las entradas y salidas de cada producto.' },
  ];
}
