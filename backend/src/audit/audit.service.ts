import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RegistroAuditoria {
  usuarioId?: number | null;
  accion: string;
  recurso: string;
  estadoHttp?: number;
  detalle?: unknown;
  ip?: string;
}

const CAMPOS_SENSIBLES = ['password', 'passwordHash', 'clave', 'token', 'accessToken', 'actual', 'nueva'];
/** Registros técnicos que deja el interceptor por cada petición que modifica datos */
const METODOS_HTTP = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra un evento. Nunca lanza error: la auditoría no debe interrumpir la operación. */
  async registrar(r: RegistroAuditoria): Promise<void> {
    try {
      await this.prisma.auditoria.create({
        data: {
          usuarioId: r.usuarioId ?? null,
          accion: r.accion.slice(0, 30),
          recurso: r.recurso.slice(0, 255),
          estadoHttp: r.estadoHttp,
          detalle: this.sanitizar(r.detalle),
          ip: r.ip?.slice(0, 64),
        },
      });
    } catch (e) {
      this.logger.error(`No se pudo registrar auditoría: ${(e as Error).message}`);
    }
  }

  /**
   * Registra un cambio de datos con el estado anterior y el nuevo.
   * Ej: registrarCambio(userId, 'ACTUALIZAR', 'cliente', 5, antes, despues)
   */
  async registrarCambio(
    usuarioId: number | undefined,
    accion: 'CREAR' | 'ACTUALIZAR' | 'DESACTIVAR' | 'REACTIVAR' | 'ELIMINAR' | 'ANULAR' | 'ADJUNTAR',
    entidad: string,
    entidadId: number,
    antes: unknown,
    despues: unknown,
  ): Promise<void> {
    await this.registrar({
      usuarioId,
      accion,
      recurso: `${entidad}/${entidadId}`,
      detalle: { antes: antes ?? null, despues: despues ?? null },
    });
  }

  /**
   * Consulta paginada de la auditoría (solo administrador).
   * texto busca en el recurso (ej. "cliente/5", "/api/planilla").
   * soloEventos oculta los registros técnicos de cada petición HTTP y deja los eventos con antes/después.
   */
  async listar(filtro: {
    usuarioId?: number;
    accion?: string;
    texto?: string;
    desde?: Date;
    hasta?: Date;
    soloEventos?: boolean;
    soloErrores?: boolean;
    pagina?: number;
    porPagina?: number;
  }) {
    const porPagina = Math.min(Math.max(filtro.porPagina ?? 50, 1), 500);
    const pagina = Math.max(filtro.pagina ?? 1, 1);
    const condiciones: Prisma.AuditoriaWhereInput[] = [];
    if (filtro.accion) condiciones.push({ accion: filtro.accion });
    if (filtro.soloEventos) condiciones.push({ accion: { notIn: METODOS_HTTP } });
    if (filtro.soloErrores) condiciones.push({ OR: [{ estadoHttp: { gte: 400 } }, { accion: 'LOGIN_FALLIDO' }] });
    const where: Prisma.AuditoriaWhereInput = {
      usuarioId: filtro.usuarioId,
      creadoEn: { gte: filtro.desde, lte: filtro.hasta },
      recurso: filtro.texto ? { contains: filtro.texto, mode: 'insensitive' } : undefined,
      AND: condiciones,
    };

    const [filas, total] = await Promise.all([
      this.prisma.auditoria.findMany({
        where,
        include: { usuario: { select: { username: true, nombre: true } } },
        orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.auditoria.count({ where }),
    ]);
    // BigInt no es serializable a JSON
    return { registros: filas.map((f) => ({ ...f, id: f.id.toString() })), total, pagina, porPagina };
  }

  /** Valores para los filtros de la vista: acciones registradas y usuarios */
  async opcionesFiltro() {
    const [acciones, usuarios] = await Promise.all([
      this.prisma.auditoria.findMany({ distinct: ['accion'], select: { accion: true }, orderBy: { accion: 'asc' } }),
      this.prisma.usuario.findMany({
        select: { id: true, username: true, nombre: true, rol: true },
        orderBy: { username: 'asc' },
      }),
    ]);
    return { acciones: acciones.map((a) => a.accion), usuarios };
  }

  private sanitizar(valor: unknown): Prisma.InputJsonValue | undefined {
    if (valor === undefined || valor === null) return undefined;
    const limpio = JSON.parse(
      JSON.stringify(valor, (k, v) => (CAMPOS_SENSIBLES.includes(k) ? '***' : v)),
    );
    return limpio as Prisma.InputJsonValue;
  }
}
