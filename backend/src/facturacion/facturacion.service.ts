import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentoSii, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { leerConfigDte, nombreAmbiente } from '../dte/dte.config';
import { camposDte, esSoloInterna, GUIA_SOLO_INTERNA } from '../dte/documento-sii';
import { DteService } from '../dte/dte.service';
import { PrismaService } from '../prisma/prisma.service';
import { calcularFactura, CalculoFactura, LineaFactura, plazoLegal } from './calculo';

/** Primer y último día de un mes 'AAAA-MM' (columnas @db.Date) */
function rangoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return { desde: fechaDesdeISO(`${mes}-01`), hasta: new Date(Date.UTC(a, m, 0)) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const CLIENTE_FACTURA = {
  select: { id: true, nombre: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true, modalidad: true },
} as const;

const NOTA_CREDITO = { select: { id: true, fecha: true, motivo: true, documentoSii: true } } as const;

/**
 * Kg y lo cobrado de una factura: se suman desde las líneas del documento emitido (no se guardan aparte).
 * Así también funciona en facturas anuladas, cuyas guías quedan libres para volver a facturarse.
 */
function totalesDetalle(detalle: Prisma.JsonValue) {
  const lineas = (detalle ?? []) as unknown as LineaFactura[];
  return {
    kg: Math.round(lineas.reduce((t, l) => t + Number(l.kg), 0) * 1000) / 1000,
    montoGuias: lineas.reduce((t, l) => t + Math.round(Number(l.kg) * Number(l.precioKg)), 0),
  };
}

/** Factura con lo necesario para entregarla por la API */
type FacturaConRelaciones = Prisma.FacturaMensualGetPayload<{
  include: { documentoSii: true; notaCredito: typeof NOTA_CREDITO };
}>;

/** Nota de crédito con la forma de la API: los datos SII aplanados y los montos de la factura que anula */
function notaCreditoApi(
  nc: { id: number; fecha: Date; motivo: string; documentoSii: DocumentoSii | null } | null,
  factura: { neto: Prisma.Decimal; iva: Prisma.Decimal; total: Prisma.Decimal },
) {
  if (!nc) return null;
  const { documentoSii, ...resto } = nc;
  const d = camposDte(documentoSii);
  return {
    ...resto,
    neto: factura.neto,
    iva: factura.iva,
    total: factura.total,
    dteEstado: d.dteEstado,
    dteFolio: d.dteFolio,
    dteAmbiente: d.dteAmbiente,
    dteError: d.dteError,
    dtePdfPath: d.dtePdfPath,
  };
}

/**
 * Facturación mensual: a fin de mes cada cliente recibe una factura (DTE 33) por todas sus guías vigentes del mes,
 * con el IVA desglosado. Cada guía queda ligada a su factura, así no se cobra dos veces.
 * Solo se facturan guías con folio SII aceptado en el ambiente actual (la factura debe referenciarlas).
 */
@Injectable()
export class FacturacionService {
  private readonly config = leerConfigDte();
  private readonly preciosConIva = this.config.preciosConIva;
  private readonly ambiente = nombreAmbiente(this.config.modo);
  /**
   * Condición de guía facturable: emitida en el SII en el mismo ambiente que se emitirá la factura,
   * o guía solo interna de un cliente presencial (retira en la panadería y no se envía al SII)
   */
  private readonly facturable: Prisma.GuiaWhereInput = {
    OR: [{ documentoSii: { is: { estado: 'EMITIDA' as const, ambiente: this.ambiente } } }, GUIA_SOLO_INTERNA],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dte: DteService,
  ) {}

  /** Una fila por cliente con guías en el mes: su factura (si ya se generó) o el cálculo de la que corresponde */
  async resumen(mes: string) {
    const { desde, hasta } = rangoMes(mes);
    const [guiasBase, facturas] = await Promise.all([
      this.prisma.guia.findMany({
        where: { despacho: { jornada: { fecha: { gte: desde, lte: hasta } } }, estado: 'VIGENTE' },
        select: {
          kg: true, kgDescuento: true, precioKg: true, monto: true, facturaMensualId: true,
          despacho: { select: { clienteId: true, cliente: { select: { modalidad: true } } } },
          documentoSii: { select: { estado: true, ambiente: true } },
        },
      }),
      this.prisma.facturaMensual.findMany({
        where: { periodo: desde },
        include: { notaCredito: NOTA_CREDITO, documentoSii: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    const guias = guiasBase.map((g) => ({
      ...g,
      clienteId: g.despacho.clienteId,
      facturable:
        esSoloInterna(g.despacho.cliente.modalidad) ||
        (g.documentoSii?.estado === 'EMITIDA' && g.documentoSii.ambiente === this.ambiente),
    }));

    const clienteIds = [...new Set([...guias.map((g) => g.clienteId), ...facturas.map((f) => f.clienteId)])];
    const clientes = await this.prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, nombre: true, rut: true, modalidad: true },
      orderBy: { nombre: 'asc' },
    });

    const filas = clientes.map((cliente) => {
      const suyas = guias.filter((g) => g.clienteId === cliente.id);
      const pendientes = suyas.filter((g) => g.facturaMensualId === null);
      const sinFacturar = pendientes.filter((g) => g.facturable);
      const factura = facturas.find((f) => f.clienteId === cliente.id && f.estado === 'VIGENTE') ?? null;
      const calculo: CalculoFactura = factura
        ? {
            // Todo sale del documento emitido: líneas, neto, IVA y total; kg y lo cobrado se suman desde sus líneas
            ...totalesDetalle(factura.detalle),
            lineas: factura.detalle as unknown as LineaFactura[],
            neto: Number(factura.neto),
            iva: Number(factura.iva),
            total: Number(factura.total),
          }
        : calcularFactura(sinFacturar, this.preciosConIva);
      return {
        cliente,
        guias: suyas.length,
        /** Guías sin facturar que no se pueden facturar aún: no tienen folio SII aceptado en este ambiente */
        guiasSinFolio: pendientes.length - sinFacturar.length,
        /** Guías con folio que no están en ninguna factura (si ya hay factura: guías emitidas después de generarla) */
        guiasSinFacturar: sinFacturar.length,
        ...calculo,
        factura: factura && this.facturaApi(factura),
        facturasAnuladas: facturas
          .filter((f) => f.clienteId === cliente.id && f.estado === 'ANULADA')
          .map((f) => ({
            id: f.id,
            dteFolio: f.documentoSii?.folio ?? null,
            motivoAnulacion: f.motivoAnulacion,
            notaCredito: notaCreditoApi(f.notaCredito, f),
          })),
      };
    });

    const suma = (k: 'kg' | 'montoGuias' | 'neto' | 'iva' | 'total') =>
      filas.reduce((s, f) => s.plus(f[k]), new Prisma.Decimal(0)).toNumber();
    const hoy = hoySantiago();
    const plazo = plazoLegal(mes);
    return {
      mes,
      desde: iso(desde),
      hasta: iso(hasta),
      /** false mientras el mes no termina (aún pueden emitirse guías) */
      mesCerrado: hoy > iso(hasta),
      /** Último día para emitir las facturas del mes (día 10 del mes siguiente) y días que quedan (negativo = vencido) */
      plazoLegal: plazo,
      diasParaPlazo: Math.round((fechaDesdeISO(plazo).getTime() - fechaDesdeISO(hoy).getTime()) / 86_400_000),
      preciosConIva: this.preciosConIva,
      filas,
      totales: {
        clientes: filas.length,
        clientesSinRut: filas.filter((f) => !f.cliente.rut).length,
        facturasGeneradas: filas.filter((f) => f.factura).length,
        /** Facturas generadas que aún no tienen folio SII */
        facturasSinEmitir: filas.filter((f) => f.factura && f.factura.dteEstado !== 'EMITIDA').length,
        guiasSinFolio: filas.reduce((s, f) => s + f.guiasSinFolio, 0),
        kg: suma('kg'),
        montoGuias: suma('montoGuias'),
        neto: suma('neto'),
        iva: suma('iva'),
        total: suma('total'),
      },
    };
  }

  /** Genera la factura del mes de un cliente con todas sus guías vigentes aún no facturadas */
  async generar(mes: string, clienteId: number, usuarioId?: number) {
    const { desde, hasta } = rangoMes(mes);
    const factura = await this.prisma.$transaction(async (tx) => {
      const existente = await tx.facturaMensual.findFirst({ where: { clienteId, periodo: desde, estado: 'VIGENTE' } });
      if (existente) {
        throw new ConflictException(`El cliente ya tiene la factura N° ${existente.id} de ese mes. Anúlela para generarla de nuevo.`);
      }
      const pendientes = {
        estado: 'VIGENTE',
        facturaMensualId: null,
        despacho: { clienteId, jornada: { fecha: { gte: desde, lte: hasta } } },
      } satisfies Prisma.GuiaWhereInput;
      const guias = (
        await tx.guia.findMany({
          where: { AND: [pendientes, this.facturable] },
          select: { id: true, kg: true, kgDescuento: true, precioKg: true, monto: true, despacho: { select: { jornada: { select: { fecha: true } } } } },
        })
      ).map((g) => ({ ...g, fecha: g.despacho.jornada.fecha }));
      const sinFolio = await tx.guia.count({ where: { AND: [pendientes, { NOT: this.facturable }] } });
      if (sinFolio > 0) {
        // Se factura el mes completo: no se deja una guía afuera solo porque aún no se emite en el SII
        throw new BadRequestException(
          `El cliente tiene ${sinFolio} guía(s) del mes sin folio SII aceptado. Emítalas primero en la pestaña Guías.`,
        );
      }
      if (guias.length === 0) throw new BadRequestException('El cliente no tiene guías vigentes sin facturar en ese mes');

      const c = calcularFactura(guias, this.preciosConIva);
      if (c.neto <= 0) throw new BadRequestException('Las guías del mes no tienen kg cobrados');

      // Fecha de emisión: el último día del mes (o hoy si el mes aún no termina), nunca antes de la última guía
      const ultimaGuia = guias.reduce((max, g) => (iso(g.fecha) > max ? iso(g.fecha) : max), iso(desde));
      const tope = [hoySantiago(), iso(hasta)].sort()[0];
      const fechaEmision = fechaDesdeISO(ultimaGuia > tope ? ultimaGuia : tope);

      const creada = await tx.facturaMensual.create({
        data: {
          clienteId,
          periodo: desde,
          fechaEmision,
          neto: c.neto,
          iva: c.iva,
          total: c.total,
          detalle: c.lineas as unknown as Prisma.InputJsonValue,
          creadoPorId: usuarioId ?? null,
        },
      });
      const { count } = await tx.guia.updateMany({
        where: { id: { in: guias.map((g) => g.id) }, estado: 'VIGENTE', facturaMensualId: null },
        data: { facturaMensualId: creada.id },
      });
      if (count !== guias.length) throw new ConflictException('Las guías cambiaron mientras se generaba la factura. Intente de nuevo.');
      return { ...creada, kg: c.kg, montoGuias: c.montoGuias };
    });
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'factura-mensual', factura.id, null, factura);
    return factura;
  }

  /** Genera las facturas del mes de todos los clientes que tienen guías sin facturar y aún no tienen factura */
  async generarTodas(mes: string, usuarioId?: number) {
    const { desde, hasta } = rangoMes(mes);
    const [pendientes, conFactura] = await Promise.all([
      this.prisma.guia.findMany({
        where: { estado: 'VIGENTE', facturaMensualId: null, despacho: { jornada: { fecha: { gte: desde, lte: hasta } } } },
        select: { despacho: { select: { clienteId: true } } },
      }),
      this.prisma.facturaMensual.findMany({ where: { periodo: desde, estado: 'VIGENTE' }, select: { clienteId: true } }),
    ]);
    const yaFacturados = new Set(conFactura.map((f) => f.clienteId));
    const clientes = [...new Set(pendientes.map((p) => p.despacho.clienteId))].filter((id) => !yaFacturados.has(id));

    const creadas: number[] = [];
    const errores: { clienteId: number; mensaje: string }[] = [];
    for (const clienteId of clientes) {
      try {
        creadas.push((await this.generar(mes, clienteId, usuarioId)).id);
      } catch (e) {
        errores.push({ clienteId, mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }
    return { creadas, errores };
  }

  async obtener(id: number) {
    const f = await this.prisma.facturaMensual.findUnique({
      where: { id },
      include: {
        cliente: CLIENTE_FACTURA,
        documentoSii: true,
        guias: {
          select: {
            id: true, kg: true, kgDescuento: true, precioKg: true, monto: true,
            documentoSii: { select: { estado: true, folio: true } },
            despacho: { select: { vuelta: true, jornada: { select: { fecha: true } } } },
          },
          orderBy: [{ despacho: { jornada: { fecha: 'asc' } } }, { despacho: { vuelta: 'asc' } }],
        },
        notaCredito: NOTA_CREDITO,
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    const guias = f.guias.map(({ despacho, documentoSii, ...g }) => ({
      ...g,
      fecha: despacho.jornada.fecha,
      vuelta: despacho.vuelta,
      dteEstado: documentoSii?.estado ?? 'NO_ENVIADA',
      dteFolio: documentoSii?.folio ?? null,
    }));
    return { ...this.facturaApi(f, true), cliente: f.cliente, guias };
  }

  /** Factura con la forma de la API: datos SII aplanados, kg y lo cobrado sumados desde sus guías */
  private facturaApi(f: FacturaConRelaciones, conDetalle = false) {
    const { documentoSii, notaCredito, detalle, ...resto } = f;
    return {
      ...resto,
      ...totalesDetalle(detalle),
      detalle: conDetalle ? detalle : undefined,
      ...camposDte(documentoSii),
      notaCredito: notaCreditoApi(notaCredito, f),
    };
  }

  /**
   * Anula la factura y libera sus guías para volver a facturarlas.
   * Si ya está emitida en el SII, primero se emite la nota de crédito que la anula allá;
   * si el SII la rechaza, la factura sigue vigente.
   */
  async anular(id: number, motivo: string, usuarioId?: number) {
    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new ConflictException('La factura ya está anulada');
    await this.dte.emitirNotaCredito(id, motivo, usuarioId);
    await this.prisma.$transaction([
      this.prisma.guia.updateMany({ where: { facturaMensualId: id }, data: { facturaMensualId: null } }),
      this.prisma.facturaMensual.update({
        where: { id },
        data: { estado: 'ANULADA', motivoAnulacion: motivo, anuladaPorId: usuarioId ?? null, anuladaEn: new Date() },
      }),
    ]);
    const despues = await this.obtener(id);
    await this.audit.registrarCambio(usuarioId, 'ANULAR', 'factura-mensual', id, antes, despues);
    return despues;
  }
}
