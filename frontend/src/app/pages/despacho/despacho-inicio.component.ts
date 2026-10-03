import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Cliente } from '../../core/models';

interface GrupoClientes {
  titulo: string;
  descripcion: string;
  clientes: Cliente[];
}

/**
 * Inicio de Despacho. Por ahora muestra la cartera de clientes agrupada igual que el cuaderno.
 * Aquí se construirá la planilla diaria de kg, guías y cuadre por repartidor.
 */
@Component({
  selector: 'app-despacho-inicio',
  template: `
    <header class="encabezado">
      <div>
        <h1>Despacho</h1>
        <p class="pp-texto-suave">Clientes agrupados como en el cuaderno · {{ totalClientes() }} clientes activos</p>
      </div>
    </header>

    @if (cargando()) {
      <p class="pp-texto-suave">Cargando clientes…</p>
    } @else if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    } @else {
      <div class="grilla">
        @for (g of grupos(); track g.titulo) {
          <section class="pp-card grupo">
            <div class="grupo__cabecera">
              <h2>{{ g.titulo }}</h2>
              <span class="pp-chip">{{ g.clientes.length }}</span>
            </div>
            <p class="pp-texto-suave grupo__desc">{{ g.descripcion }}</p>
            <ol class="lista">
              @for (c of g.clientes; track c.id) {
                <li>{{ c.nombre }}</li>
              }
            </ol>
          </section>
        }
      </div>
    }

    <section class="pp-card proximamente">
      <h2>Próximamente en este módulo</h2>
      <ul>
        <li>Planilla diaria de kg por cliente</li>
        <li>Guía impresa por caja con respaldo digital</li>
        <li>Cuadre automático por repartidor</li>
        <li>Pagos, saldos y promedio mensual por cliente</li>
      </ul>
    </section>
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
    .grupo__cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid var(--pp-celeste-claro);
      margin-bottom: 0.5rem;
    }
    .grupo__cabecera h2 {
      font-size: 1.05rem;
      color: var(--pp-celeste-oscuro);
    }
    .grupo__desc {
      font-size: 0.82rem;
      margin: 0 0 0.5rem;
    }
    .lista {
      margin: 0;
      padding-left: 1.4rem;
      columns: 2;
      font-size: 0.92rem;
    }
    .proximamente {
      margin-top: 1.5rem;
      background: var(--pp-celeste-claro);
    }
    .proximamente h2 {
      font-size: 1rem;
    }
  `,
})
export class DespachoInicioComponent {
  private readonly http = inject(HttpClient);

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly totalClientes = computed(() => this.clientes().length);

  protected readonly grupos = computed<GrupoClientes[]>(() => {
    const todos = this.clientes();
    const grupos: GrupoClientes[] = [
      {
        titulo: 'Pago día siguiente',
        descripcion: 'Llevan hoy y pagan mañana junto a los clientes del Repartidor 2.',
        clientes: todos.filter((c) => c.modalidad === 'PAGO_DIA_SIGUIENTE'),
      },
    ];

    // Un grupo por cada repartidor (Repartidor 1, Repartidor 2, ...)
    const porRepartidor = new Map<string, Cliente[]>();
    for (const c of todos.filter((x) => x.modalidad === 'REPARTO')) {
      const nombre = c.repartidor?.nombre ?? 'Sin repartidor';
      porRepartidor.set(nombre, [...(porRepartidor.get(nombre) ?? []), c]);
    }
    for (const [nombre, clientes] of [...porRepartidor.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      grupos.push({ titulo: nombre, descripcion: 'Reparto y cobro del día.', clientes });
    }

    grupos.push({
      titulo: 'Presenciales',
      descripcion: 'Retiran en la panadería; los atiende el despachador.',
      clientes: todos.filter((c) => c.modalidad === 'PRESENCIAL'),
    });
    return grupos;
  });

  constructor() {
    this.http.get<Cliente[]>('/api/clientes').subscribe({
      next: (data) => {
        this.clientes.set(data);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los clientes.');
        this.cargando.set(false);
      },
    });
  }
}
