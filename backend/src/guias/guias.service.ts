import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ModalidadCliente, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_GUIA = {
  cliente: { select: { id: true, nombre: true, modalidad: true, direccion: true } },
  repartidor: { select: { id: true, nombre: true, patente: true } },
} as const;

type DespachoConGuias = Prisma.DespachoGetPayload<{ include: { jornada: true; guias: true } }>;

@Injectable()
export class GuiasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Historial / búsqueda de guías */
  listar(filtro: { fecha?: string; clienteId?: number; numero?: number; incluirAnuladas?: boolean }) {
    return this.prisma.guia.findMany({
      where: {
        id: filtro.numero,
        fecha: filtro.fecha ? fechaDesdeISO(filtro.fecha) : undefined,
        clienteId: filtro.clienteId,
        estado: filtro.incluirAnuladas ? undefined : 'VIGENTE',
      },
      include: INCLUDE_GUIA,
      orderBy: [{ fecha: 'desc' }, { vuelta: 'asc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async obtener(id: number) {
    const g = await this.prisma.guia.findUnique({ where: { id }, include: INCLUDE_GUIA });
    if (!g) throw new NotFoundException('Guía no encontrada');
    return g;
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
      .map((g) => ({ ...g, esCopia: g.impresiones > 0 }));
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

  /** Una guía emitida no se edita: solo se anula, con motivo, quién y cuándo */
  async anular(id: number, motivo: string, usuarioId?: number) {
    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new ConflictException('La guía ya está anulada');
    const despues = await this.prisma.guia.update({
      where: { id },
      data: { estado: 'ANULADA', motivoAnulacion: motivo, anuladaPorId: usuarioId ?? null, anuladaEn: new Date() },
      include: INCLUDE_GUIA,
    });
    await this.audit.registrarCambio(usuarioId, 'ACTUALIZAR', 'guia', id, antes, despues);
    return despues;
  }

  private async crearDesde(d: DespachoConGuias, usuarioId?: number) {
    if (Number(d.kg) <= 0) throw new BadRequestException('No se puede emitir una guía con 0 kg');
    const vigente = d.guias.find((g) => g.estado === 'VIGENTE');
    if (vigente) throw new ConflictException(`Ya existe la guía N° ${vigente.id} vigente para este cliente y vuelta`);

    const guia = await this.prisma.guia.create({
      data: {
        despachoId: d.id,
        clienteId: d.clienteId,
        repartidorId: d.repartidorId,
        fecha: d.jornada.fecha,
        vuelta: d.vuelta,
        kg: d.kg,
        kgDescuento: d.kgDescuento,
        precioKg: d.precioKg,
        monto: d.monto,
        creadoPorId: usuarioId ?? null,
      },
    });
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'guia', guia.id, null, guia);
    return guia;
  }
}
