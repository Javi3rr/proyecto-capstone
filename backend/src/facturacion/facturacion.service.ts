import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { leerConfigDte, nombreAmbiente } from '../dte/dte.config';
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

const NOTA_CREDITO = {
  select: { id: true, fecha: true, motivo: true, dteEstado: true, dteFolio: true, dteAmbiente: true, dteError: true, dtePdfPath: true },
} as const;

/**
 * Facturación mensual: a fin de mes cada cliente recibe una factura (DTE 33) por todas sus guías vigentes del mes,
 * con el IVA desglosado. Cada guía queda ligada a su factura, así no se cobra dos veces.
 * Solo se facturan guías con folio SII aceptado en el ambiente actual (la factura debe referenciarlas).
 */
@Injectable()
export class FacturacionService {
  private readonly config = leerConfigDte();
  private readonly preciosConIva = this.config.preciosConIva;
  /** Condición de guía facturable: emitida en el SII, en el mismo ambiente que se emitirá la factura */
  private readonly conFolio = { dteEstado: 'EMITIDA', dteAmbiente: nombreAmbiente(this.config.modo) } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dte: DteService,
  ) {}

  /** Una fila por cliente con guías en el mes: su factura (si ya se generó) o el cálculo de la que corresponde */
  async resumen(mes: string) {
    const { desde, hasta } = rangoMes(mes);
    const [guias, facturas] = await Promise.all([
      this.prisma.guia.findMany({
        where: { fecha: { gte: desde, lte: hasta }, estado: 'VIGENTE' },
        select: {
          clienteId: true, kg: true, kgDescuento: true, precioKg: true, monto: true,
          dteEstado: true, dteAmbiente: true, facturaMensualId: true,
        },
      }),
      this.prisma.facturaMensual.findMany({ where: { periodo: desde }, include: { notaCredito: NOTA_CREDITO }, orderBy: { id: 'asc' } }),
    ]);

    const clienteIds = [...new Set([...guias.map((g) => g.clienteId), ...facturas.map((f) => f.clienteId)])];
    const clientes = await this.prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, nombre: true, rut: true, modalidad: true },
      orderBy: { nombre: 'asc' },
    });

    const facturable = (g: (typeof guias)[number]) =>
      g.dteEstado === this.conFolio.dteEstado && g.dteAmbiente === this.conFolio.dteAmbiente;
    const filas = clientes.map((cliente) => {
      const suyas = guias.filter((g) => g.clienteId === cliente.id);
      const pendientes = suyas.filter((g) => g.facturaMensualId === null);
      const sinFacturar = pendientes.filter(facturable);
      const factura = facturas.find((f) => f.clienteId === cliente.id && f.estado === 'VIGENTE') ?? null;
      const calculo: CalculoFactura = factura
        ? {
            lineas: factura.detalle as unknown as LineaFactura[],
            kg: Number(factura.kg),
            montoGuias: Number(factura.montoGuias),
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
        factura: factura && { ...factura, detalle: undefined },
        facturasAnuladas: facturas
          .filter((f) => f.clienteId === cliente.id && f.estado === 'ANULADA')
          .map((f) => ({ id: f.id, dteFolio: f.dteFolio, motivoAnulacion: f.motivoAnulacion, notaCredito: f.notaCredito })),
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
      const pendientes = { clienteId, estado: 'VIGENTE', facturaMensualId: null, fecha: { gte: desde, lte: hasta } } as const;
      const guias = await tx.guia.findMany({
        where: { ...pendientes, ...this.conFolio },
        select: { id: true, fecha: true, kg: true, kgDescuento: true, precioKg: true, monto: true },
      });
      const sinFolio = await tx.guia.count({ where: { ...pendientes, NOT: this.conFolio } });
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
          kg: c.kg,
          montoGuias: c.montoGuias,
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
      return creada;
    });
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'factura-mensual', factura.id, null, factura);
    return factura;
  }

  /** Genera las facturas del mes de todos los clientes que tienen guías sin facturar y aún no tienen factura */
  async generarTodas(mes: string, usuarioId?: number) {
    const { desde, hasta } = rangoMes(mes);
    const [pendientes, conFactura] = await Promise.all([
      this.prisma.guia.findMany({
        where: { estado: 'VIGENTE', facturaMensualId: null, fecha: { gte: desde, lte: hasta } },
        select: { clienteId: true },
        distinct: ['clienteId'],
      }),
      this.prisma.facturaMensual.findMany({ where: { periodo: desde, estado: 'VIGENTE' }, select: { clienteId: true } }),
    ]);
    const yaFacturados = new Set(conFactura.map((f) => f.clienteId));

    const creadas: number[] = [];
    const errores: { clienteId: number; mensaje: string }[] = [];
    for (const { clienteId } of pendientes.filter((p) => !yaFacturados.has(p.clienteId))) {
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
        guias: {
          select: {
            id: true, fecha: true, vuelta: true, kg: true, kgDescuento: true, precioKg: true, monto: true,
            dteEstado: true, dteFolio: true,
          },
          orderBy: [{ fecha: 'asc' }, { vuelta: 'asc' }],
        },
        notaCredito: NOTA_CREDITO,
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    return f;
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
