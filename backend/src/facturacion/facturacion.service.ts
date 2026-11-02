import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { leerConfigDte } from '../dte/dte.config';
import { PrismaService } from '../prisma/prisma.service';
import { calcularFactura, CalculoFactura, LineaFactura } from './calculo';

/** Primer y último día de un mes 'AAAA-MM' (columnas @db.Date) */
function rangoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  return { desde: fechaDesdeISO(`${mes}-01`), hasta: new Date(Date.UTC(a, m, 0)) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const CLIENTE_FACTURA = {
  select: { id: true, nombre: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true, modalidad: true },
} as const;

/**
 * Facturación mensual: a fin de mes cada cliente recibe una factura (DTE 33) por todas sus guías vigentes del mes,
 * con el IVA desglosado. Cada guía queda ligada a su factura, así no se cobra dos veces.
 */
@Injectable()
export class FacturacionService {
  private readonly preciosConIva = leerConfigDte().preciosConIva;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Una fila por cliente con guías en el mes: su factura (si ya se generó) o el cálculo de la que corresponde */
  async resumen(mes: string) {
    const { desde, hasta } = rangoMes(mes);
    const [guias, facturas] = await Promise.all([
      this.prisma.guia.findMany({
        where: { fecha: { gte: desde, lte: hasta }, estado: 'VIGENTE' },
        select: { clienteId: true, kg: true, kgDescuento: true, precioKg: true, monto: true, dteEstado: true, facturaMensualId: true },
      }),
      this.prisma.facturaMensual.findMany({ where: { periodo: desde }, orderBy: { id: 'asc' } }),
    ]);

    const clienteIds = [...new Set([...guias.map((g) => g.clienteId), ...facturas.map((f) => f.clienteId)])];
    const clientes = await this.prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      select: { id: true, nombre: true, rut: true, modalidad: true },
      orderBy: { nombre: 'asc' },
    });

    const filas = clientes.map((cliente) => {
      const suyas = guias.filter((g) => g.clienteId === cliente.id);
      const sinFacturar = suyas.filter((g) => g.facturaMensualId === null);
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
        /** Guías vigentes sin guía electrónica en el SII */
        guiasSinFolio: suyas.filter((g) => g.dteEstado !== 'EMITIDA').length,
        /** Guías que no están en ninguna factura (si ya hay factura: guías registradas después de generarla) */
        guiasSinFacturar: sinFacturar.length,
        ...calculo,
        factura: factura && { ...factura, detalle: undefined },
        facturasAnuladas: facturas.filter((f) => f.clienteId === cliente.id && f.estado === 'ANULADA').length,
      };
    });

    const suma = (k: 'kg' | 'montoGuias' | 'neto' | 'iva' | 'total') =>
      filas.reduce((s, f) => s.plus(f[k]), new Prisma.Decimal(0)).toNumber();
    return {
      mes,
      desde: iso(desde),
      hasta: iso(hasta),
      /** false mientras el mes no termina (aún pueden emitirse guías) */
      mesCerrado: hoySantiago() > iso(hasta),
      preciosConIva: this.preciosConIva,
      filas,
      totales: {
        clientes: filas.length,
        facturasGeneradas: filas.filter((f) => f.factura).length,
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
      const guias = await tx.guia.findMany({
        where: { clienteId, estado: 'VIGENTE', facturaMensualId: null, fecha: { gte: desde, lte: hasta } },
        select: { id: true, fecha: true, kg: true, kgDescuento: true, precioKg: true, monto: true },
      });
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
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    return f;
  }

  /** Anula la factura y libera sus guías para volver a facturarlas */
  async anular(id: number, motivo: string, usuarioId?: number) {
    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new ConflictException('La factura ya está anulada');
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
