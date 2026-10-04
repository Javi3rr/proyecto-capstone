import { DatePipe, JsonPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { descargarCsv } from '../../core/csv';
import { mensajeError } from '../../core/errores';
import { FiltroAuditoria, OpcionesAuditoria, PaginaAuditoria, RegistroAuditoria } from '../../core/models';
import { hoyISO, sumarDias } from '../despacho/despacho.service';

type Vista = 'eventos' | 'todo' | 'errores';

interface CambioCampo {
  campo: string;
  antes: string;
  despues: string;
}

const NOMBRE_ACCION: Record<string, string> = {
  CREAR: 'Creó',
  ACTUALIZAR: 'Modificó',
  DESACTIVAR: 'Desactivó',
  REACTIVAR: 'Reactivó',
  ELIMINAR: 'Eliminó',
  LOGIN: 'Inició sesión',
  LOGIN_FALLIDO: 'Ingreso fallido',
  IMPRIMIR_GUIAS: 'Imprimió guías',
  CERRAR_DIA: 'Cerró el día',
  REABRIR_DIA: 'Reabrió el día',
  REGISTRAR_PAGO: 'Registró pago',
  ELIMINAR_PAGO: 'Borró pago',
  ANULAR: 'Anuló',
  ADJUNTAR: 'Adjuntó archivo',
};

const NOMBRE_ENTIDAD: Record<string, string> = {
  cliente: 'Cliente',
  repartidor: 'Repartidor',
  precio_kg: 'Precio del kg',
  despacho: 'Línea de planilla',
  guia: 'Guía',
  jornada: 'Planilla del día',
  pago: 'Pago',
  producto: 'Producto',
  proveedor: 'Proveedor',
  factura: 'Factura',
  usuario: 'Usuario',
};

/** Campos que no aportan al comparar antes/después */
const CAMPOS_OMITIDOS = ['creadoEn', 'actualizadoEn', 'id'];

/** [TRANSVERSAL] Consulta de la auditoría para el administrador: quién hizo qué y cuándo */
@Component({
  selector: 'app-auditoria',
  imports: [DatePipe, JsonPipe, RouterLink],
  template: `
    <header class="encabezado">
      <div>
        <a routerLink="/admin" class="volver">← Administración</a>
        <h1>Auditoría</h1>
        <p class="pp-texto-suave">
          Cada creación, modificación, anulación e ingreso al sistema queda registrado con usuario, fecha y hora.
          Nadie puede editar este registro.
        </p>
      </div>
    </header>

    @if (error()) {
      <p class="pp-alerta-error" role="alert">{{ error() }}</p>
    }

    <section class="pp-card">
      <form class="filtros" (submit)="$event.preventDefault(); aplicar(desde.value, hasta.value, usuario.value, accion.value, texto.value, vista.value)">
        <label>Desde <input #desde type="date" [value]="filtro().desde ?? ''" /></label>
        <label>Hasta <input #hasta type="date" [value]="filtro().hasta ?? ''" /></label>
        <label>
          Usuario
          <select #usuario>
            <option value="">Todos</option>
            @for (u of opciones()?.usuarios ?? []; track u.id) {
              <option [value]="u.id">{{ u.username }} ({{ u.nombre }})</option>
            }
          </select>
        </label>
        <label>
          Acción
          <select #accion>
            <option value="">Todas</option>
            @for (a of opciones()?.acciones ?? []; track a) {
              <option [value]="a">{{ nombreAccion(a) }}</option>
            }
          </select>
        </label>
        <label>
          Buscar en el registro
          <input #texto type="search" placeholder="Ej. cliente/5, guia, planilla" maxlength="100" />
        </label>
        <label>
          Mostrar
          <select #vista>
            <option value="eventos">Cambios e ingresos</option>
            <option value="errores">Solo errores e ingresos fallidos</option>
            <option value="todo">Todo (incluye peticiones técnicas)</option>
          </select>
        </label>
        <button type="submit" class="pp-btn pp-btn--chico">Buscar</button>
        <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="!pagina()?.total" (click)="exportar()">
          Exportar Excel (CSV)
        </button>
      </form>

      @if (pagina(); as p) {
        <div class="resumen">
          <span>
            {{ p.total === 0 ? 'Sin registros' : 'Mostrando ' + desdeN() + '–' + hastaN() + ' de ' + p.total }}
          </span>
          <div class="paginas">
            <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="p.pagina <= 1" (click)="irPagina(p.pagina - 1)">◀ Anterior</button>
            <span>Página {{ p.pagina }} de {{ totalPaginas() }}</span>
            <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" [disabled]="p.pagina >= totalPaginas()" (click)="irPagina(p.pagina + 1)">Siguiente ▶</button>
          </div>
        </div>

        <div class="tabla-scroll">
          <table class="pp-tabla">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Sobre qué</th>
                <th>Resultado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of p.registros; track r.id) {
                <tr [class.fallo]="esFallo(r)">
                  <td class="nowrap">{{ r.creadoEn | date: 'dd-MM-yyyy HH:mm:ss' }}</td>
                  <td>{{ r.usuario?.username ?? '—' }}</td>
                  <td><span class="accion" [attr.data-tipo]="tipoAccion(r.accion)">{{ nombreAccion(r.accion) }}</span></td>
                  <td>{{ descripcion(r) }}</td>
                  <td class="nowrap">{{ resultado(r) }}</td>
                  <td class="derecha">
                    @if (r.detalle) {
                      <button type="button" class="pp-btn pp-btn--secundario pp-btn--chico" (click)="alternar(r.id)">
                        {{ abierto() === r.id ? 'Ocultar' : 'Detalle' }}
                      </button>
                    }
                  </td>
                </tr>
                @if (abierto() === r.id) {
                  <tr class="detalle">
                    <td colspan="6">
                      @if (cambios(r); as cs) {
                        @if (cs.length === 0) {
                          <p class="pp-texto-suave">Sin diferencias entre antes y después.</p>
                        } @else {
                          <table class="cambios">
                            <thead>
                              <tr><th>Campo</th><th>Antes</th><th>Después</th></tr>
                            </thead>
                            <tbody>
                              @for (c of cs; track c.campo) {
                                <tr>
                                  <td><strong>{{ c.campo }}</strong></td>
                                  <td class="antes">{{ c.antes }}</td>
                                  <td class="despues">{{ c.despues }}</td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      } @else {
                        <pre>{{ r.detalle | json }}</pre>
                      }
                      <p class="meta">Registro técnico: {{ r.accion }} {{ r.recurso }} · IP {{ r.ip ?? '—' }}</p>
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="6" class="pp-texto-suave">No hay registros para esos filtros.</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (cargando()) {
        <p class="pp-texto-suave">Cargando…</p>
      }
    </section>
  `,
  styles: `
    .encabezado {
      margin-bottom: 1rem;
    }
    .encabezado p {
      margin: 0;
    }
    .volver {
      font-size: 0.85rem;
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
    .resumen {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--pp-celeste-claro);
      border-radius: 8px;
      font-size: 0.88rem;
    }
    .paginas {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .tabla-scroll {
      overflow-x: auto;
    }
    .pp-tabla {
      font-size: 0.86rem;
    }
    .pp-tabla th,
    .pp-tabla td {
      padding: 0.3rem 0.45rem;
    }
    .nowrap {
      white-space: nowrap;
    }
    .derecha {
      text-align: right;
    }
    .accion {
      display: inline-block;
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--pp-celeste-claro);
      color: var(--pp-celeste-oscuro);
      white-space: nowrap;
    }
    .accion[data-tipo='alta'] {
      background: #e3f6ea;
      color: var(--pp-exito);
    }
    .accion[data-tipo='baja'] {
      background: #fdecec;
      color: var(--pp-error);
    }
    .accion[data-tipo='tecnica'] {
      background: #eef1f4;
      color: var(--pp-texto-suave);
    }
    tr.fallo td {
      background: #fff5f5;
    }
    tr.detalle td {
      background: #fafcfe;
    }
    .cambios {
      border-collapse: collapse;
      font-size: 0.82rem;
      margin: 0.25rem 0;
    }
    .cambios th,
    .cambios td {
      border: 1px solid var(--pp-borde);
      padding: 0.25rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    .antes {
      color: var(--pp-error);
    }
    .despues {
      color: var(--pp-exito);
    }
    pre {
      margin: 0.25rem 0;
      padding: 0.5rem;
      max-height: 260px;
      overflow: auto;
      background: #f3f6f9;
      border-radius: 6px;
      font-size: 0.78rem;
    }
    .meta {
      margin: 0.35rem 0 0;
      font-size: 0.75rem;
      color: var(--pp-texto-suave);
    }
  `,
})
export class AuditoriaComponent {
  private readonly http = inject(HttpClient);

  protected readonly opciones = signal<OpcionesAuditoria | null>(null);
  protected readonly filtro = signal<FiltroAuditoria>({
    desde: sumarDias(hoyISO(), -6),
    hasta: hoyISO(),
    soloEventos: true,
    pagina: 1,
    porPagina: 50,
  });
  protected readonly pagina = signal<PaginaAuditoria | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly abierto = signal<string | null>(null);

  protected readonly totalPaginas = computed(() => {
    const p = this.pagina();
    return p ? Math.max(1, Math.ceil(p.total / p.porPagina)) : 1;
  });
  protected readonly desdeN = computed(() => {
    const p = this.pagina();
    return p ? (p.pagina - 1) * p.porPagina + 1 : 0;
  });
  protected readonly hastaN = computed(() => {
    const p = this.pagina();
    return p ? (p.pagina - 1) * p.porPagina + p.registros.length : 0;
  });

  constructor() {
    this.http.get<OpcionesAuditoria>('/api/auditoria/opciones').subscribe({ next: (o) => this.opciones.set(o) });
    this.cargar();
  }

  aplicar(desde: string, hasta: string, usuarioId: string, accion: string, texto: string, vista: string): void {
    const v = vista as Vista;
    this.filtro.set({
      desde: desde || undefined,
      hasta: hasta || undefined,
      usuarioId: usuarioId ? Number(usuarioId) : undefined,
      accion: accion || undefined,
      texto: texto.trim() || undefined,
      soloEventos: v === 'eventos',
      soloErrores: v === 'errores',
      pagina: 1,
      porPagina: 50,
    });
    this.cargar();
  }

  irPagina(n: number): void {
    this.filtro.update((f) => ({ ...f, pagina: n }));
    this.cargar();
  }

  alternar(id: string): void {
    this.abierto.set(this.abierto() === id ? null : id);
  }

  private parametros(f: FiltroAuditoria): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) params = params.set(k, String(v));
    }
    return params;
  }

  private cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.abierto.set(null);
    this.http.get<PaginaAuditoria>('/api/auditoria', { params: this.parametros(this.filtro()) }).subscribe({
      next: (p) => {
        this.pagina.set(p);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeError(e, 'No se pudo cargar la auditoría.'));
        this.cargando.set(false);
      },
    });
  }

  // ---------- Presentación ----------

  protected nombreAccion(accion: string): string {
    return NOMBRE_ACCION[accion] ?? (['POST', 'PUT', 'PATCH', 'DELETE'].includes(accion) ? `Petición ${accion}` : accion);
  }

  protected tipoAccion(accion: string): string {
    if (['CREAR', 'REACTIVAR', 'LOGIN', 'REGISTRAR_PAGO'].includes(accion)) return 'alta';
    if (['DESACTIVAR', 'ANULAR', 'ELIMINAR', 'LOGIN_FALLIDO', 'ELIMINAR_PAGO', 'REABRIR_DIA'].includes(accion)) return 'baja';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(accion)) return 'tecnica';
    return 'normal';
  }

  protected esFallo(r: RegistroAuditoria): boolean {
    return r.accion === 'LOGIN_FALLIDO' || (r.estadoHttp ?? 0) >= 400;
  }

  protected resultado(r: RegistroAuditoria): string {
    if (r.accion === 'LOGIN_FALLIDO') return 'Rechazado';
    if (r.estadoHttp === null) return 'OK';
    if (r.estadoHttp < 400) return `OK (${r.estadoHttp})`;
    if (r.estadoHttp === 401 || r.estadoHttp === 403) return `Sin permiso (${r.estadoHttp})`;
    if (r.estadoHttp < 500) return `Rechazado (${r.estadoHttp})`;
    return `Error del servidor (${r.estadoHttp})`;
  }

  /** Texto legible del recurso. Ej: "cliente/5" -> "Cliente #5 · Isla" */
  protected descripcion(r: RegistroAuditoria): string {
    if (r.recurso.startsWith('/api/')) return r.recurso.replace('/api/', '');
    const partes = r.recurso.split('/');
    const entidad = NOMBRE_ENTIDAD[partes[0]] ?? partes[0];
    if (partes[0] === 'pago') return `Pago del cliente #${partes[2]} · ${this.fecha(partes[3])}`;
    if (partes[0] === 'jornada') return `${entidad} ${this.fecha(partes[1])}`;
    const nombre = this.nombreEn(r.detalle);
    const id = partes[1] && /^\d+$/.test(partes[1]) ? ` #${partes[1]}` : partes[1] ? ` ${partes.slice(1).join('/')}` : '';
    return `${entidad}${id}${nombre ? ' · ' + nombre : ''}`;
  }

  /** Compara antes/después campo a campo. null si el registro no tiene ese formato. */
  protected cambios(r: RegistroAuditoria): CambioCampo[] | null {
    const d = r.detalle as { antes?: unknown; despues?: unknown } | null;
    if (!d || typeof d !== 'object' || !('antes' in d || 'despues' in d)) return null;
    const antes = (d.antes && typeof d.antes === 'object' ? d.antes : {}) as Record<string, unknown>;
    const despues = (d.despues && typeof d.despues === 'object' ? d.despues : {}) as Record<string, unknown>;
    const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
      (c) => !CAMPOS_OMITIDOS.includes(c),
    );
    return campos
      .map((c) => ({ campo: c, antes: this.texto(antes[c]), despues: this.texto(despues[c]) }))
      .filter((c) => c.antes !== c.despues);
  }

  exportar(): void {
    const f = { ...this.filtro(), pagina: 1, porPagina: 500 };
    this.http.get<PaginaAuditoria>('/api/auditoria', { params: this.parametros(f) }).subscribe({
      next: (p) =>
        descargarCsv(`auditoria-${f.desde ?? 'inicio'}-a-${f.hasta ?? hoyISO()}.csv`, [
          ['Fecha y hora', 'Usuario', 'Acción', 'Sobre qué', 'Resultado', 'Registro técnico', 'IP'],
          ...p.registros.map((r) => [
            new Date(r.creadoEn).toLocaleString('es-CL'),
            r.usuario?.username ?? '',
            this.nombreAccion(r.accion),
            this.descripcion(r),
            this.resultado(r),
            `${r.accion} ${r.recurso}`,
            r.ip ?? '',
          ]),
        ]),
      error: (e) => this.error.set(mensajeError(e, 'No se pudo exportar.')),
    });
  }

  private nombreEn(detalle: unknown): string | null {
    const d = detalle as { antes?: Record<string, unknown>; despues?: Record<string, unknown> } | null;
    const obj = d?.despues ?? d?.antes;
    if (!obj || typeof obj !== 'object') return null;
    const v = obj['nombre'] ?? obj['razonSocial'] ?? obj['username'];
    return typeof v === 'string' ? v : null;
  }

  private fecha(iso: string | undefined): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
    const [a, m, d] = iso.split('-');
    return `${d}-${m}-${a}`;
  }

  private texto(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
