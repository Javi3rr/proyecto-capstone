import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { FacturaResumen, Proveedor } from '../../core/models';
import { hoyISO, sumarDias } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

/** [MESÓN] Listado de facturas de mercadería recibida */
@Component({
  selector: 'app-facturas',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <h1>Facturas de mercadería</h1>
        <p class="pp-texto-suave">
          Respaldo de todo lo que entra al local. Al registrar una factura, su mercadería se suma al stock.
        </p>
      </div>
      <a routerLink="/meson/facturas/nueva" class="pp-btn">+ Registrar factura</a>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); buscar(desde.value, hasta.value, proveedor.value, numero.value, anuladas.checked)">
        <label>Desde <input #desde type="date" [value]="filtro().desde" /></label>
        <label>Hasta <input #hasta type="date" [value]="filtro().hasta" /></label>
        <label>
          Proveedor
          <select #proveedor>
            <option value="">Todos</option>
            @for (p of proveedores(); track p.id) {
              <option [value]="p.id">{{ p.razonSocial }}</option>
            }
          </select>
        </label>
        <label>N° factura <input #numero type="search" maxlength="30" placeholder="Ej. 4512" /></label>
        <label class="check"><input #anuladas type="checkbox" /> Incluir anuladas</label>
        <button type="submit" class="pp-btn pp-btn--chico">Buscar</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="facturas().length === 0" (click)="exportar()">
          Exportar Excel (CSV)
        </button>
      </form>

      <div class="resumen">
        <span><strong>{{ vigentes().length }}</strong> factura(s) vigente(s)</span>
        <span>Neto: <strong>{{ totalNeto() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        <span>Total con IVA: <strong>{{ totalBruto() | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></span>
        @if (sinArchivo() > 0) {
          <span class="alerta">{{ sinArchivo() }} sin foto/PDF</span>
        }
      </div>

      <div class="tabla-scroll">
        <table class="pp-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>N°</th>
              <th class="num">Líneas</th>
              <th class="num">Neto</th>
              <th class="num">IVA</th>
              <th class="num">Total</th>
              <th>Respaldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (f of facturas(); track f.id) {
              <tr class="fila" [class.anulada]="f.estado === 'ANULADA'" (click)="abrir(f.id)" tabindex="0" (keydown.enter)="abrir(f.id)">
                <td class="nowrap">{{ f.fecha | date: 'dd-MM-yyyy' : 'UTC' }}</td>
                <td>{{ f.proveedor.razonSocial }}</td>
                <td><strong>{{ f.numero }}</strong></td>
                <td class="num">{{ f._count.detalles }}</td>
                <td class="num">{{ num(f.neto) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="num">{{ num(f.iva) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</td>
                <td class="num"><strong>{{ num(f.total) | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</strong></td>
                <td>
                  @if (f.archivoPath) {
                    <span class="pp-chip">{{ f.archivoTipo === 'application/pdf' ? 'PDF' : 'Foto' }}</span>
                  } @else {
                    <span class="falta">Sin archivo</span>
                  }
                </td>
                <td>
                  @if (f.estado === 'ANULADA') {
                    <span class="pp-chip anulada-chip" [title]="f.motivoAnulacion ?? ''">Anulada</span>
                  } @else {
                    <span class="pp-chip">Vigente</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="pp-texto-suave">{{ cargando() ? 'Buscando…' : 'No hay facturas para ese filtro.' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .encabezado {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .encabezado a {
      text-decoration: none;
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 0.9rem;
      align-items: flex-end;
      margin-bottom: 0.75rem;
    }
    .filtros label {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--pp-texto-suave);
    }
    .filtros input,
    .filtros select {
      min-height: 36px;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
      color: var(--pp-texto);
    }
    .filtros label.check {
      flex-direction: row;
      align-items: center;
      gap: 0.35rem;
      min-height: 36px;
    }
    .filtros label.check input {
      min-height: auto;
    }
    .resumen {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      padding: 0.45rem 0.75rem;
      margin-bottom: 0.6rem;
      background: var(--pp-celeste-claro);
      border-radius: 8px;
      font-size: 0.9rem;
    }
    .alerta,
    .falta {
      color: var(--pp-alerta);
      font-weight: 600;
    }
    .falta {
      font-size: 0.8rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla {
      font-size: 0.88rem;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .nowrap {
      white-space: nowrap;
    }
    tr.fila {
      cursor: pointer;
    }
    tr.fila:hover td,
    tr.fila:focus td {
      background: var(--pp-celeste-claro);
    }
    tr.anulada td {
      color: var(--pp-texto-suave);
      text-decoration: line-through;
    }
    tr.anulada td:last-child {
      text-decoration: none;
    }
    .anulada-chip {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class FacturasComponent {
  private readonly api = inject(MesonService);
  private readonly router = inject(Router);

  protected readonly proveedores = signal<Proveedor[]>([]);
  protected readonly facturas = signal<FacturaResumen[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filtro = signal<{
    desde: string;
    hasta: string;
    proveedorId?: number;
    numero?: string;
    incluirAnuladas?: boolean;
  }>({ desde: sumarDias(hoyISO(), -30), hasta: hoyISO() });

  protected readonly vigentes = computed(() => this.facturas().filter((f) => f.estado === 'VIGENTE'));
  protected readonly totalNeto = computed(() => this.vigentes().reduce((t, f) => t + Number(f.neto), 0));
  protected readonly totalBruto = computed(() => this.vigentes().reduce((t, f) => t + Number(f.total), 0));
  protected readonly sinArchivo = computed(() => this.vigentes().filter((f) => !f.archivoPath).length);

  constructor() {
    this.api.proveedores(true).subscribe({ next: (p) => this.proveedores.set(p) });
    this.cargar();
  }

  protected num(v: string | number | null | undefined): number {
    return v === null || v === undefined ? 0 : Number(v);
  }

  buscar(desde: string, hasta: string, proveedorId: string, numero: string, incluirAnuladas: boolean): void {
    this.filtro.set({
      desde,
      hasta,
      proveedorId: proveedorId ? Number(proveedorId) : undefined,
      numero: numero.trim() || undefined,
      incluirAnuladas,
    });
    this.cargar();
  }

  abrir(id: number): void {
    void this.router.navigate(['/meson/facturas', id]);
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api.facturas(this.filtro()).subscribe({
      next: (f) => {
        this.facturas.set(f);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudieron cargar las facturas.'));
        this.cargando.set(false);
      },
    });
  }

  exportar(): void {
    const f = this.filtro();
    descargarCsv(`facturas-${f.desde || 'inicio'}-a-${f.hasta || hoyISO()}.csv`, [
      ['Fecha', 'Proveedor', 'RUT', 'N° factura', 'Líneas', 'Neto', 'IVA', 'Total', 'Respaldo', 'Estado', 'Motivo anulación'],
      ...this.facturas().map((x) => [
        x.fecha.slice(0, 10),
        x.proveedor.razonSocial,
        x.proveedor.rut,
        x.numero,
        x._count.detalles,
        Number(x.neto),
        Number(x.iva),
        Number(x.total),
        x.archivoPath ? 'Sí' : 'No',
        x.estado === 'VIGENTE' ? 'Vigente' : 'Anulada',
        x.motivoAnulacion ?? '',
      ]),
    ]);
  }
}
