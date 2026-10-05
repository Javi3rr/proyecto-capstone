import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { Kardex, MovimientoKardex, NOMBRE_MOVIMIENTO } from '../../core/models';
import { hoyISO, sumarDias } from '../despacho/despacho.service';
import { MesonService } from './meson.service';

/** [MESÓN] Kardex: historial no editable de entradas y salidas de un producto */
@Component({
  selector: 'app-kardex',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/stock" class="volver">← Stock</a>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (kardex(); as k) {
      <header class="encabezado">
        <div>
          <h1>Kardex · {{ k.producto.nombre }}</h1>
          <p class="pp-texto-suave">
            PLU {{ k.producto.plu }} · Stock actual: <strong>{{ k.producto.stockActual | number: '1.0-3' }} {{ unidad() }}</strong>.
            El historial no se edita; las correcciones se hacen con conteos (nuevos movimientos).
          </p>
        </div>
      </header>

      <section class="pp-card">
        <form class="filtros" (submit)="$event.preventDefault(); buscar(desde.value, hasta.value)">
          <label>Desde <input #desde type="date" [value]="filtroDesde()" /></label>
          <label>Hasta <input #hasta type="date" [value]="filtroHasta()" /></label>
          <button type="submit" class="pp-btn pp-btn--chico">Ver</button>
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="buscar('', '')">Todo el historial</button>
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="k.movimientos.length === 0" (click)="exportar(k)">
            Exportar Excel (CSV)
          </button>
        </form>

        <div class="resumen">
          <span>Saldo inicial: <strong>{{ k.saldoInicial | number: '1.0-3' }}</strong></span>
          <span class="entra">Entradas: <strong>+{{ k.entradas | number: '1.0-3' }}</strong></span>
          <span class="sale">Salidas: <strong>{{ k.salidas | number: '1.0-3' }}</strong></span>
          <span>Saldo final: <strong>{{ k.saldoFinal | number: '1.0-3' }}</strong></span>
        </div>

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Movimiento</th>
                <th>Origen</th>
                <th class="num">Cantidad</th>
                <th class="num">Saldo</th>
                <th>Usuario</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              @for (m of k.movimientos; track m.id) {
                <tr>
                  <td class="nowrap">{{ m.fecha | date: 'dd-MM-yyyy HH:mm' }}</td>
                  <td><span class="tipo" [class.positivo]="m.cantidad > 0" [class.negativo]="m.cantidad < 0">{{ nombreMovimiento[m.tipo] }}</span></td>
                  <td class="nowrap">
                    @if (m.origenTipo === 'FACTURA' && m.origenId) {
                      <a [routerLink]="['/meson/facturas', m.origenId]">Factura #{{ m.origenId }}</a>
                    } @else if (m.origenTipo === 'CONTEO' && m.origenId) {
                      <a [routerLink]="['/meson/conteos', m.origenId]">Conteo N° {{ m.origenId }}</a>
                    } @else {
                      {{ m.origenTipo ?? '—' }}
                    }
                  </td>
                  <td class="num" [class.entra]="m.cantidad > 0" [class.sale]="m.cantidad < 0">
                    {{ m.cantidad > 0 ? '+' : '' }}{{ m.cantidad | number: '1.0-3' }}
                  </td>
                  <td class="num"><strong>{{ m.saldo | number: '1.0-3' }}</strong></td>
                  <td>{{ m.usuario ?? (m.codigoMesonera ? 'Mesonera ' + m.codigoMesonera : '—') }}</td>
                  <td class="sub">{{ m.motivo ?? '' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="pp-texto-suave">Sin movimientos en el período.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (!error()) {
      <p class="pp-texto-suave">Cargando…</p>
    }
  `,
  styles: `
    .volver {
      display: inline-block;
      font-size: 0.85rem;
      text-decoration: none;
      margin-bottom: 0.5rem;
    }
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
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
    .filtros input {
      min-height: 36px;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--pp-borde);
      border-radius: 8px;
      font: 0.9rem var(--pp-fuente);
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
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla {
      font-size: 0.86rem;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .nowrap {
      white-space: nowrap;
    }
    .sub {
      font-size: 0.8rem;
      color: var(--pp-texto-suave);
    }
    .entra {
      color: var(--pp-exito);
    }
    .sale {
      color: var(--pp-error);
    }
    .tipo {
      display: inline-block;
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      background: #eef1f4;
    }
    .tipo.positivo {
      background: #e3f6ea;
      color: var(--pp-exito);
    }
    .tipo.negativo {
      background: #fdecec;
      color: var(--pp-error);
    }
  `,
})
export class KardexComponent {
  private readonly api = inject(MesonService);
  private readonly productoId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  protected readonly nombreMovimiento = NOMBRE_MOVIMIENTO;
  protected readonly kardex = signal<Kardex | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly filtroDesde = signal(sumarDias(hoyISO(), -30));
  protected readonly filtroHasta = signal(hoyISO());

  constructor() {
    if (!Number.isInteger(this.productoId) || this.productoId <= 0) {
      this.error.set('Producto no válido.');
      return;
    }
    this.cargar();
  }

  protected unidad(): string {
    return this.kardex()?.producto.unidad === 'KG' ? 'kg' : 'un.';
  }

  buscar(desde: string, hasta: string): void {
    this.filtroDesde.set(desde);
    this.filtroHasta.set(hasta);
    this.cargar();
  }

  private cargar(): void {
    this.error.set(null);
    this.api.kardex(this.productoId, this.filtroDesde() || undefined, this.filtroHasta() || undefined).subscribe({
      next: (k) => this.kardex.set(k),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el kardex.')),
    });
  }

  exportar(k: Kardex): void {
    descargarCsv(`kardex-${k.producto.plu}-${hoyISO()}.csv`, [
      ['Fecha y hora', 'Movimiento', 'Origen', 'Cantidad', 'Saldo', 'Usuario', 'Detalle'],
      ...k.movimientos.map((m: MovimientoKardex) => [
        new Date(m.fecha).toLocaleString('es-CL'),
        this.nombreMovimiento[m.tipo],
        m.origenTipo ? `${m.origenTipo} ${m.origenId ?? ''}`.trim() : '',
        m.cantidad,
        m.saldo,
        m.usuario ?? m.codigoMesonera ?? '',
        m.motivo ?? '',
      ]),
    ]);
  }
}
