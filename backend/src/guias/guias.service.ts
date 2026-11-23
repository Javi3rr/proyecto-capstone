import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ModalidadCliente, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO } from '../common/utils';
import { guiaApi, INCLUDE_GUIA_COMPLETA, montoLinea } from '../dte/documento-sii';
import { PrismaService } from '../prisma/prisma.service';

/** Cliente, repartidor, fecha y vuelta vienen del despacho; los datos SII, de su documento */
const INCLUDE_GUIA = INCLUDE_GUIA_COMPLETA;

type DespachoConGuias = Prisma.DespachoGetPayload<{ include: { jornada: true; guias: true } }>;

@Injectable()
export class GuiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Historial / búsqueda de guías */
  async listar(filtro: { fecha?: string; clienteId?: number; numero?: number; incluirAnuladas?: boolean }) {
    const guias = await this.prisma.guia.findMany({
      where: {
        id: filtro.numero,
        despacho: {
          clienteId: filtro.clienteId,
          jornada: filtro.fecha ? { fecha: fechaDesdeISO(filtro.fecha) } : undefined,
        },
        estado: filtro.incluirAnuladas ? undefined : 'VIGENTE',
      },
      include: INCLUDE_GUIA,
      orderBy: [{ despacho: { jornada: { fecha: 'desc' } } }, { despacho: { vuelta: 'asc' } }, { id: 'desc' }],
      take: 500,
    });
    return guias.map(guiaApi);
  }

  async obtener(id: number) {
    const g = await this.prisma.guia.findUnique({ where: { id }, include: INCLUDE_GUIA });
    if (!g) throw new NotFoundException('Guía no encontrada');
    return guiaApi(g);
  }

  /** Emite la guía de una línea de la planilla (una guía vigente por cliente y vuelta) */
  async emitir(despachoId: number, usuarioId?: number) {
    const despacho = await this.prisma.despacho.findUnique({
      where: { id: despachoId },
      include: { jornada: true, guias: true },
    });
    if (!despacho) throw new NotFoundException('Registro de despacho no encontrado');
    const guia = await this.crearDesde(despacho, usuarioId);
    return this.obtener(guia.id);
  }

  /** Emite todas las guías pendientes de un día (o de un grupo) y devuelve los N° a imprimir */
  async emitirLote(
    fecha: string,
    filtro: { modalidad?: ModalidadCliente; repartidorId?: number; vuelta?: number },
    usuarioId?: number,
  ) {
    const jornada = await this.prisma.jornadaDespacho.findUnique({ where: { fecha: fechaDesdeISO(fecha) } });
    if (!jornada) throw new BadRequestException('No hay registros en la planilla para esa fecha');

    const despachos = await this.prisma.despacho.findMany({
      where: {
        jornadaId: jornada.id,
        kg: { gt: 0 },
        // El grupo es el de la planilla (repartidor habitual del cliente), aunque ese día haya repartido otro
        cliente: { modalidad: filtro.modalidad, repartidorId: filtro.repartidorId },
        vuelta: filtro.vuelta,
      },
      include: { jornada: true, guias: true, cliente: { select: { orden: true } } },
    });
    despachos.sort((a, b) => a.vuelta - b.vuelta || a.cliente.orden - b.cliente.orden);

    const creadas: number[] = [];
    const ids: number[] = [];
    for (const d of despachos) {
      const vigente = d.guias.find((g) => g.estado === 'VIGENTE');
      if (vigente) {
        ids.push(vigente.id);
      } else {
        const g = await this.crearDesde(d, usuarioId);
        creadas.push(g.id);
        ids.push(g.id);
      }
    }
    return { creadas, ids };
  }

  /**
   * Guías para la vista de impresión. NO registra nada:
   * esCopia = true si la guía ya se había impreso antes (se marca "COPIA").
   */
  async paraImprimir(ids: number[]) {
    const guias = await this.prisma.guia.findMany({ where: { id: { in: ids } }, include: INCLUDE_GUIA });
    if (guias.length === 0) throw new NotFoundException('No se encontraron las guías');
    const orden = new Map(ids.map((id, i) => [id, i]));
    return guias
      .sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0))
      .map((g) => ({ ...guiaApi(g), esCopia: g.impresiones > 0 }));
  }

  /** El usuario confirmó que las guías se imprimieron: desde ahora una reimpresión sale como "COPIA" */
  async confirmarImpresion(ids: number[], usuarioId?: number) {
    const guias = await this.prisma.guia.findMany({ where: { id: { in: ids } }, select: { id: true, impresiones: true } });
    if (guias.length === 0) throw new NotFoundException('No se encontraron las guías');
    await this.prisma.guia.updateMany({
      where: { id: { in: guias.map((g) => g.id) } },
      data: { impresiones: { increment: 1 } },
    });
    await this.audit.registrar({
      usuarioId,
      accion: 'IMPRIMIR_GUIAS',
      recurso: 'guias',
      detalle: { ids: guias.map((g) => g.id), copias: guias.filter((g) => g.impresiones > 0).map((g) => g.id) },
    });
    return { registradas: guias.length };
  }

  /**
   * Una guía emitida no se edita: solo se anula, con motivo, quién y cuándo.
   * Si ya tiene guía electrónica en el SII, esa guía no se puede anular con nota de crédito ni por la API del
   * proveedor: se anula a mano en el portal y el usuario debe confirmar que lo hizo (anuladaEnSii); queda registrado.
   * Los folios del modo simulado no existen fuera del sistema, así que no lo requieren.
   */
  async anular(id: number, motivo: string, usuarioId?: number, anuladaEnSii = false) {
    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new ConflictException('La guía ya está anulada');
    if (antes.facturaMensualId) {
      throw new ConflictException(
        `La guía está incluida en la factura mensual N° ${antes.facturaMensualId}. Anule primero esa factura (pestaña Facturación).`,
      );
    }
    const enSii = antes.dteEstado === 'EMITIDA' && antes.dteAmbiente !== 'SIMULADO';
    if (enSii && !anuladaEnSii) {
      throw new BadRequestException(
        `La guía N° ${antes.id} tiene la guía electrónica folio ${antes.dteFolio} en el SII. ` +
          'Anúlela primero en el portal del SII o del proveedor de facturación y luego confirme que lo hizo.',
      );
    }
    const despues = guiaApi(
      await this.prisma.guia.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          motivoAnulacion: motivo,
          anuladaPorId: usuarioId ?? null,
          anuladaEn: new Date(),
          // La anulación manual en el SII queda registrada en su documento
          ...(enSii ? { documentoSii: { update: { anuladoEn: new Date(), anuladoPorId: usuarioId ?? null } } } : {}),
        },
        include: INCLUDE_GUIA,
      }),
    );
    await this.audit.registrarCambio(usuarioId, 'ACTUALIZAR', 'guia', id, antes, despues);
    return despues;
  }

  private async crearDesde(d: DespachoConGuias, usuarioId?: number) {
    if (Number(d.kg) <= 0) throw new BadRequestException('No se puede emitir una guía con 0 kg');
    const vigente = d.guias.find((g) => g.estado === 'VIGENTE');
    if (vigente) throw new ConflictException(`Ya existe la guía N° ${vigente.id} vigente para este cliente y vuelta`);
    // Corrección de kg: la guía nueva reemplaza a la última anulada de este cliente y vuelta
    const reemplaza = d.guias.filter((g) => g.estado === 'ANULADA').sort((a, b) => b.id - a.id)[0];

    const guia = await this.prisma.guia.create({
      data: {
        reemplazaAId: reemplaza?.id ?? null,
        despachoId: d.id,
        // Valores del documento tal como se emite (el despacho se puede corregir después de anular la guía)
        kg: d.kg,
        kgDescuento: d.kgDescuento,
        precioKg: d.precioKg,
        monto: montoLinea(d.kg, d.kgDescuento, d.precioKg),
        creadoPorId: usuarioId ?? null,
      },
    });
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'guia', guia.id, null, guia);
    return guia;
  }
}
