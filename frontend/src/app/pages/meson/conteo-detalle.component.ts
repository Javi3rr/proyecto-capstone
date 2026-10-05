import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { Conteo } from '../../core/models';
import { MesonService } from './meson.service';

/** [MESÓN] Reporte de diferencias de un conteo físico */
@Component({
  selector: 'app-conteo-detalle',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <a routerLink="/meson/conteos" class="volver no-imprimir">← Conteos</a>

    @if (mensaje()) {
      <p class="pp-aviso-ok no-imprimir" role="status">{{ mensaje() }}</p>
    }
    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    @if (conteo(); as c) {
      <header class="encabezado">
        <div>
          <h1>Conteo N° {{ c.id }}</h1>
          <p class="pp-texto-suave">
            {{ c.fecha | date: 'dd-MM-yyyy HH:mm' }} · por {{ c.usuario ?? '—' }}{{ c.observacion ? ' · ' + c.observacion : '' }}
          </p>
        </div>
        <div class="no-imprimir botones">
          <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="exportar(c)">Exportar Excel (CSV)</button>
          <button type="button" class="pp-btn pp-btn--chico" (click)="imprimir()">Imprimir</button>
        </div>
      </header>

      <div class="tarjetas">
        <div class="pp-card tarjeta"><span>Productos contados</span><strong>{{ c.resumen.productos }}</strong></div>
        <div class="pp-card tarjeta falta"><span>Faltantes</span><strong>{{ c.resumen.faltantes }}</strong><small>{{ c.resumen.valorFaltante | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</small></div>
        <div class="pp-card tarjeta sobra"><span>Sobrantes</span><strong>{{ c.resumen.sobrantes }}</strong><small>{{ c.resumen.valorSobrante | currency: 'CLP' : 'symbol-narrow' : '1.0-0' }}</small></div>
      </div>

      <section class="pp-card">
        <label class="check no-imprimir">
          <input type="checkbox" [checked]="soloDiferencias()" (change)="soloDiferencias.set($any($event.target).checked)" /> Solo con diferencia
        </label>
        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>PLU</th>
                <th>Producto</th>
                <th class="num">Sistema</th>
                <th class="num">Contado</th>
                <th class="num">Diferencia</th>
                <th class="num">Valor</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              @for (d of filas(); track d.id) {
                <tr>
                  <td><code>{{ d.producto.plu }}</code></td>
                  <td>
                    <a class="no-imprimir-link" [routerLink]="['/meson/kardex', d.producto.id]">{{ d.producto.nombre }}</a>
                  </td>
                  <td class="num">{{ d.stockEsperado | number: '1.0-3' }}</td>
                  <td class="num">{{ d.stockContado | number: '1.0-3' }}</td>
                  <td class="num" [class.falta-txt]="d.diferencia < 0" [class.sobra-txt]="d.diferencia > 0">
                    {{ d.diferencia > 0 ? '+' : '' }}{{ d.diferencia | number: '1.0-3' }}
                  </td>
                  <td class="num">{{ d.valorDiferencia ? (d.valorDiferencia | currency: 'CLP' : 'symbol-narrow' : '1.0-0') : '—' }}</td>
                  <td>{{ d.motivo ?? 'Coincide' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="pp-texto-suave">Todos los productos contados coinciden con el sistema.</td></tr>
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
    .botones button + button {
      margin-left: 0.35rem;
    }
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .tarjeta {
      display: flex;
      flex-direction: column;
      border-left: 5px solid var(--pp-celeste);
    }
    .tarjeta strong {
      font-size: 1.5rem;
      color: var(--pp-celeste-oscuro);
    }
    .tarjeta.falta {
      border-left-color: var(--pp-error);
    }
    .tarjeta.falta strong {
      color: var(--pp-error);
    }
    .tarjeta.sobra {
      border-left-color: var(--pp-exito);
    }
    .tarjeta.sobra strong {
      color: var(--pp-exito);
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.6rem;
      font-size: 0.88rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .num {
      text-align: right;
      white-space: nowrap;
    }
    .falta-txt {
      color: var(--pp-error);
      font-weight: 700;
    }
    .sobra-txt {
      color: var(--pp-exito);
      font-weight: 700;
    }
    @media print {
      .no-imprimir-link {
        color: inherit;
        text-decoration: none;
      }
    }
  `,
})
export class ConteoDetalleComponent {
  private readonly api = inject(MesonService);

  protected readonly conteo = signal<Conteo | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);
  protected readonly soloDiferencias = signal(true);

  protected readonly filas = computed(() =>
    (this.conteo()?.detalles ?? []).filter((d) => !this.soloDiferencias() || d.diferencia !== 0),
  );

  constructor() {
    if ((history.state as { nuevo?: boolean } | null)?.nuevo) {
      this.mensaje.set('Conteo guardado. Los productos con diferencia ya tienen su stock ajustado.');
    }
    const id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('Conteo no válido.');
      return;
    }
    this.api.conteo(id).subscribe({
      next: (c) => this.conteo.set(c),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo cargar el conteo.')),
    });
  }

  exportar(c: Conteo): void {
    descargarCsv(`conteo-${c.id}.csv`, [
      ['PLU', 'Producto', 'Sistema', 'Contado', 'Diferencia', 'Valor diferencia', 'Motivo'],
      ...c.detalles.map((d) => [
        d.producto.plu,
        d.producto.nombre,
        d.stockEsperado,
        d.stockContado,
        d.diferencia,
        d.valorDiferencia,
        d.motivo ?? 'Coincide',
      ]),
    ]);
  }

  imprimir(): void {
    window.print();
  }
}
