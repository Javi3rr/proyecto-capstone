import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { mensajeError } from '../../core/errores';
import { Cliente, Guia } from '../../core/models';
import { DespachoService, abrirImpresionGuias, hoyISO } from './despacho.service';

/** [DESPACHO] Respaldo digital de guías: búsqueda, reimpresión (PDF) y anulación */
@Component({
  selector: 'app-guias',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <header class="encabezado">
      <h1>Guías emitidas</h1>
      <p class="pp-texto-suave">
        Respaldo digital de cada guía. Para obtener un PDF use "Imprimir" y elija "Guardar como PDF".
      </p>
    </header>

    @if (mensaje()) {
      <p class="pp-aviso-ok" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <div class="filtros">
        <div class="pp-campo">
          <label for="f-fecha">Fecha</label>
          <input id="f-fecha" #fecha type="date" [value]="filtroFecha" />
        </div>
        <div class="pp-campo">
          <label for="f-numero">N° de guía</label>
          <input id="f-numero" #numero type="number" min="1" placeholder="Ej. 125" />
        </div>
        <div class="pp-campo">
          <label for="f-cliente">Cliente</label>
          <select id="f-cliente" #cliente>
            <option value="">Todos</option>
            @for (c of clientes(); track c.id) {
              <option [value]="c.id">{{ c.nombre }}</option>
            }
          </select>
        </div>
        <label class="check"><input type="checkbox" #anuladas /> Incluir anuladas</label>
        <button
          type="button"
          class="pp-btn"
          (click)="buscar(fecha.value, numero.value, cliente.value, anuladas.checked)"
        >
          Buscar
        </button>
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Repartidor</th>
              <th class="num">Kg</th>
              <th class="num">Monto</th>
              <th>Estado</th>
              <th class="num">Impresiones</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (g of guias(); track g.id) {
              <tr [class.anulada]="g.estado === 'ANULADA'">
                <td><strong>{{ g.id }}</strong></td>
                <td>{{ g.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                <td>{{ g.cliente.nombre }}</td>
                <td>{{ g.repartidor?.nombre ?? 'Presencial' }}</td>
                <td class="num">{{ num(g.kg) | number: '1.0-3' }}</td>
                <td class="num">{{ num(g.monto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td>
                  @if (g.estado === 'ANULADA') {
                    <span class="pp-chip anulada-chip" [title]="g.motivoAnulacion ?? ''">Anulada</span>
                  } @else {
                    <span class="pp-chip">Vigente</span>
                  }
                </td>
                <td class="num">{{ g.impresiones }}</td>
                <td class="botones">
                  <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="imprimir(g)">Imprimir</button>
                  @if (g.estado === 'VIGENTE') {
                    <button type="button" class="pp-btn pp-btn--peligro pp-btn--chico" (click)="anular(g)">Anular</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="pp-texto-suave">{{ cargando() ? 'Buscando…' : 'No hay guías para ese filtro.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: flex-end;
    }
    .filtros .pp-campo {
      min-width: 160px;
    }
    .filtros .pp-btn {
      margin-bottom: 1rem;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 1.4rem;
      font-size: 0.9rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
    }
    .botones {
      white-space: nowrap;
      text-align: right;
    }
    .botones button + button {
      margin-left: 0.35rem;
    }
    tr.anulada td {
      color: var(--pp-texto-suave);
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class GuiasComponent {
  private readonly api = inject(DespachoService);

  protected readonly filtroFecha = hoyISO();
  protected readonly guias = signal<Guia[]>([]);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  private ultimoFiltro: { fecha?: string; numero?: number; clienteId?: number; incluirAnuladas?: boolean } = {
    fecha: this.filtroFecha,
  };

  constructor() {
    this.api.clientes(true).subscribe({ next: (c) => this.clientes.set(c) });
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  buscar(fecha: string, numero: string, clienteId: string, incluirAnuladas: boolean): void {
    this.ultimoFiltro = {
      fecha: fecha || undefined,
      numero: numero ? Number(numero) : undefined,
      clienteId: clienteId ? Number(clienteId) : undefined,
      incluirAnuladas,
    };
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.guias(this.ultimoFiltro).subscribe({
      next: (g) => {
        this.guias.set(g);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar las guías.'));
        this.cargando.set(false);
      },
    });
  }

  imprimir(g: Guia): void {
    abrirImpresionGuias([g.id]);
    this.guias.set(this.guias().map((x) => (x.id === g.id ? { ...x, impresiones: x.impresiones + 1 } : x)));
  }

  anular(g: Guia): void {
    const motivo = prompt(
      `Anular guía N° ${g.id} (${g.cliente.nombre}).\nIndique el motivo (queda registrado en la auditoría):`,
    );
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      this.error.set('Debe indicar un motivo de al menos 5 caracteres.');
      return;
    }
    this.mensaje.set(null);
    this.api.anularGuia(g.id, motivo.trim()).subscribe({
      next: () => {
        this.mensaje.set(`Guía N° ${g.id} anulada. Ahora puede corregir los kg en la planilla y emitir una nueva.`);
        this.cargar();
      },
      error: (e) => this.error.set(mensajeError(e)),
    });
  }
}
