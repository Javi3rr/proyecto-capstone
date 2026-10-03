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

const CAMPOS_SENSIBLES = ['password', 'passwordHash', 'clave', 'token'];

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

  async listar(filtro: { usuarioId?: number; desde?: Date; hasta?: Date; limite?: number }) {
    const filas = await this.prisma.auditoria.findMany({
      where: {
        usuarioId: filtro.usuarioId,
        creadoEn: { gte: filtro.desde, lte: filtro.hasta },
      },
      include: { usuario: { select: { username: true, nombre: true } } },
      orderBy: { creadoEn: 'desc' },
      take: Math.min(filtro.limite ?? 100, 500),
    });
    // BigInt no es serializable a JSON
    return filas.map((f) => ({ ...f, id: f.id.toString() }));
  }

  private sanitizar(valor: unknown): Prisma.InputJsonValue | undefined {
    if (valor === undefined || valor === null) return undefined;
    const limpio = JSON.parse(
      JSON.stringify(valor, (k, v) => (CAMPOS_SENSIBLES.includes(k) ? '***' : v)),
    );
    return limpio as Prisma.InputJsonValue;
  }
}
