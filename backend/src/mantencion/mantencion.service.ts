import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MantencionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Deja Despacho en blanco para empezar a usarlo en serio: borra planillas, guías,
   * marcas de "no pagó" y pagos antiguos. Conserva clientes, repartidores y precios.
   * La numeración de guías vuelve a partir en N° 1. La auditoría no se borra.
   */
  async limpiarDespacho(usuarioId?: number) {
    const borrados = await this.prisma.$transaction(async (tx) => {
      const noPagos = await tx.noPago.deleteMany({});
      const pagos = await tx.pago.deleteMany({});
      const guias = await tx.guia.deleteMany({});
      const despachos = await tx.despacho.deleteMany({});
      const jornadas = await tx.jornadaDespacho.deleteMany({});
      for (const tabla of ['guias', 'despachos', 'jornadas_despacho', 'pagos', 'no_pagos']) {
        await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${tabla}"', 'id'), 1, false)`);
      }
      return {
        planillas: jornadas.count,
        lineas: despachos.count,
        guias: guias.count,
        pagos: pagos.count,
        noPagos: noPagos.count,
      };
    });
    await this.audit.registrar({
      usuarioId,
      accion: 'LIMPIAR_DESPACHO',
      recurso: 'mantencion/limpiar-despacho',
      detalle: borrados,
    });
    return borrados;
  }
}
