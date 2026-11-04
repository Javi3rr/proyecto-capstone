import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigDte, leerConfigDte, problemasConfig } from './dte.config';
import type { LineaFactura } from '../facturacion/calculo';
import { armarFactura33 } from './factura33';
import { armarGuia52, GuiaParaDte } from './guia52';
import { armarNotaCredito61 } from './notaCredito61';
import { ErrorEmision, ProveedorDte, ProveedorOpenFactura, ProveedorSimulado, ResultadoEmision } from './proveedores';

const NOMBRE_AMBIENTE = { simulado: 'Simulado (sin conexión)', pruebas: 'Pruebas del proveedor (sin efecto tributario)', produccion: 'Producción SII' };

/**
 * Documentos electrónicos ante el SII: guía de despacho (DTE 52), factura mensual (DTE 33)
 * y la nota de crédito (DTE 61) que anula una factura emitida.
 *
 * Guía de despacho electrónica (DTE 52).
 * La guía interna se sigue emitiendo e imprimiendo igual; esto la "eleva" a documento tributario:
 * se arma el DTE, el proveedor certificado lo firma, timbra y envía al SII, y se guarda el folio oficial y su PDF.
 */
@Injectable()
export class DteService {
  private readonly logger = new Logger(DteService.name);
  private readonly config: ConfigDte = leerConfigDte();
  private readonly proveedor: ProveedorDte =
    this.config.modo === 'simulado' ? new ProveedorSimulado() : new ProveedorOpenFactura(this.config);
  private readonly dirUploads = resolve(process.env.UPLOADS_DIR ?? './uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cómo está configurada la emisión (para mostrarlo en pantalla) */
  estado() {
    const problemas = problemasConfig(this.config);
    return {
      modo: this.config.modo,
      ambiente: NOMBRE_AMBIENTE[this.config.modo],
      emisor: { rut: this.config.emisor.rut || null, razonSocial: this.config.emisor.razonSocial || null },
      listo: problemas.length === 0,
      problemas,
    };
  }

  /** Emite en el SII la guía interna indicada */
  async emitir(guiaId: number, usuarioId?: number) {
    const problemas = problemasConfig(this.config);
    if (problemas.length) throw new BadRequestException(`Emisión electrónica no configurada: ${problemas.join(' ')}`);

    const g = await this.prisma.guia.findUnique({
      where: { id: guiaId },
      include: {
        cliente: { select: { nombre: true, modalidad: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true } },
        repartidor: { select: { nombre: true, rut: true, patente: true } },
      },
    });
    if (!g) throw new NotFoundException('Guía no encontrada');
    if (g.estado === 'ANULADA') throw new ConflictException(`La guía N° ${g.id} está anulada`);
    if (g.dteEstado === 'EMITIDA') throw new ConflictException(`La guía N° ${g.id} ya tiene la guía electrónica folio ${g.dteFolio}`);

    const armado = this.armar({
      id: g.id,
      fecha: g.fecha,
      vuelta: g.vuelta,
      kg: Number(g.kg),
      kgDescuento: Number(g.kgDescuento),
      precioKg: Number(g.precioKg),
      monto: Number(g.monto),
      cliente: g.cliente,
      repartidor: g.repartidor,
    });

    const intento = g.dteIntentos + 1;
    await this.prisma.guia.update({ where: { id: g.id }, data: { dteIntentos: intento } });

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-guia-${g.id}-${intento}`, () => this.siguienteFolioSimulado(52));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`guia-${g.id}-folio-${r.folio}`, r);
      const avisos = [
        armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
        ...armado.avisos,
      ].filter(Boolean);
      const actualizada = await this.prisma.guia.update({
        where: { id: g.id },
        data: {
          dteEstado: 'EMITIDA',
          dteFolio: r.folio,
          dteAmbiente: this.proveedor.nombre,
          dteToken: r.token?.slice(0, 200) ?? null,
          dteError: avisos.length ? avisos.join(' ').slice(0, 1000) : null,
          dtePdfPath: pdfPath,
          dteXmlPath: xmlPath,
          dteEmitidaEn: new Date(),
          dteEmitidaPorId: usuarioId ?? null,
        },
      });
      await this.audit.registrar({
        usuarioId,
        accion: 'EMITIR_DTE',
        recurso: `guia/${g.id}`,
        detalle: { folio: r.folio, ambiente: this.proveedor.nombre, totales: armado.totales, receptorDePrueba: armado.receptorDePrueba },
      });
      return actualizada;
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmision ? e.message : `Error inesperado al emitir: ${e instanceof Error ? e.message : 'desconocido'}`;
      if (!(e instanceof ErrorEmision)) this.logger.error(mensaje);
      await this.prisma.guia.update({ where: { id: g.id }, data: { dteEstado: 'RECHAZADA', dteError: mensaje.slice(0, 1000) } });
      await this.audit.registrar({ usuarioId, accion: 'DTE_RECHAZADO', recurso: `guia/${g.id}`, detalle: { intento, mensaje } });
      throw new BadRequestException(mensaje);
    }
  }

  /** Emite todas las guías vigentes del día que aún no están en el SII (una por una, respetando el límite del proveedor) */
  async emitirDia(fecha: string, usuarioId?: number) {
    const pendientes = await this.prisma.guia.findMany({
      where: { fecha: fechaDesdeISO(fecha), estado: 'VIGENTE', dteEstado: { not: 'EMITIDA' } },
      select: { id: true },
      orderBy: [{ vuelta: 'asc' }, { id: 'asc' }],
    });
    const emitidas: { guiaId: number; folio: number | null }[] = [];
    const errores: { guiaId: number; mensaje: string }[] = [];
    for (const [i, p] of pendientes.entries()) {
      if (i > 0 && this.config.modo !== 'simulado') await new Promise((r) => setTimeout(r, 400));
      try {
        const g = await this.emitir(p.id, usuarioId);
        emitidas.push({ guiaId: g.id, folio: g.dteFolio });
      } catch (e) {
        errores.push({ guiaId: p.id, mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }
    return { total: pendientes.length, emitidas, errores };
  }

  private armar(datos: GuiaParaDte) {
    try {
      return armarGuia52(datos, this.config);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'No se pudo armar la guía electrónica');
    }
  }

  /** Emite en el SII la factura mensual (DTE 33), referenciando las guías electrónicas (DTE 52) que cobra */
  async emitirFactura(facturaId: number, usuarioId?: number) {
    const problemas = problemasConfig(this.config);
    if (problemas.length) throw new BadRequestException(`Emisión electrónica no configurada: ${problemas.join(' ')}`);

    const f = await this.prisma.facturaMensual.findUnique({
      where: { id: facturaId },
      include: {
        cliente: { select: { nombre: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true } },
        guias: { select: { id: true, fecha: true, dteEstado: true, dteFolio: true, dteAmbiente: true } },
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    if (f.estado === 'ANULADA') throw new ConflictException(`La factura N° ${f.id} está anulada`);
    if (f.dteEstado === 'EMITIDA') throw new ConflictException(`La factura N° ${f.id} ya tiene folio ${f.dteFolio} en el SII`);

    // La factura referencia todas sus guías: deben estar emitidas en el mismo ambiente (un folio de pruebas no existe en producción)
    const conFolio = f.guias.filter((g) => g.dteEstado === 'EMITIDA' && g.dteFolio && g.dteAmbiente === this.proveedor.nombre);
    const sinFolio = f.guias.length - conFolio.length;
    if (sinFolio > 0) {
      throw new BadRequestException(
        `Hay ${sinFolio} guía(s) de esta factura sin folio SII en el ambiente actual (${this.proveedor.nombre}). ` +
          'Anule la factura y genérela de nuevo cuando sus guías estén emitidas.',
      );
    }

    let armado: ReturnType<typeof armarFactura33>;
    try {
      armado = armarFactura33(
        {
          id: f.id,
          fechaEmision: f.fechaEmision,
          periodo: f.periodo,
          lineas: f.detalle as unknown as LineaFactura[],
          neto: Number(f.neto),
          iva: Number(f.iva),
          total: Number(f.total),
          cliente: f.cliente,
          guias: conFolio.map((g) => ({ folio: g.dteFolio!, fecha: g.fecha })),
        },
        this.config,
      );
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'No se pudo armar la factura electrónica');
    }

    const intento = f.dteIntentos + 1;
    await this.prisma.facturaMensual.update({ where: { id: f.id }, data: { dteIntentos: intento } });

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-factura-${f.id}-${intento}`, () => this.siguienteFolioSimulado(33));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`factura-${f.id}-folio-${r.folio}`, r);
      const actualizada = await this.prisma.facturaMensual.update({
        where: { id: f.id },
        data: {
          dteEstado: 'EMITIDA',
          dteFolio: r.folio,
          dteAmbiente: this.proveedor.nombre,
          dteToken: r.token?.slice(0, 200) ?? null,
          dteError: armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
          dtePdfPath: pdfPath,
          dteXmlPath: xmlPath,
          dteEmitidaEn: new Date(),
          dteEmitidaPorId: usuarioId ?? null,
        },
      });
      await this.audit.registrar({
        usuarioId,
        accion: 'EMITIR_DTE',
        recurso: `factura-mensual/${f.id}`,
        detalle: { tipo: 33, folio: r.folio, ambiente: this.proveedor.nombre, totales: armado.totales, guiasReferenciadas: conFolio.length },
      });
      return actualizada;
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmision ? e.message : `Error inesperado al emitir: ${e instanceof Error ? e.message : 'desconocido'}`;
      if (!(e instanceof ErrorEmision)) this.logger.error(mensaje);
      await this.prisma.facturaMensual.update({ where: { id: f.id }, data: { dteEstado: 'RECHAZADA', dteError: mensaje.slice(0, 1000) } });
      await this.audit.registrar({ usuarioId, accion: 'DTE_RECHAZADO', recurso: `factura-mensual/${f.id}`, detalle: { intento, mensaje } });
      throw new BadRequestException(mensaje);
    }
  }

  /**
   * Emite en el SII la nota de crédito (DTE 61) que anula la factura indicada.
   * Devuelve null si la factura no necesita nota de crédito: no está emitida en el SII, o su folio es de
   * simulado/pruebas y la emisión actual es de otro ambiente (ese folio no tiene validez tributaria aquí).
   * Si el SII la rechaza lanza un error y la factura sigue vigente; se puede reintentar.
   */
  async emitirNotaCredito(facturaId: number, motivo: string, usuarioId?: number) {
    const f = await this.prisma.facturaMensual.findUnique({
      where: { id: facturaId },
      include: {
        cliente: { select: { nombre: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true } },
        notaCredito: true,
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    if (f.estado === 'ANULADA') throw new ConflictException(`La factura N° ${f.id} ya está anulada`);
    if (f.dteEstado !== 'EMITIDA' || !f.dteFolio) return null;
    // Ya se anuló en el SII en un intento anterior: solo falta anularla en el sistema
    if (f.notaCredito?.dteEstado === 'EMITIDA') return f.notaCredito;
    if (f.dteAmbiente !== this.proveedor.nombre) {
      if (f.dteAmbiente === 'PRODUCCION') {
        throw new BadRequestException(
          `La factura N° ${f.id} tiene folio ${f.dteFolio} de producción: su nota de crédito solo se puede emitir con la emisión en producción.`,
        );
      }
      return null;
    }
    const problemas = problemasConfig(this.config);
    if (problemas.length) throw new BadRequestException(`Emisión electrónica no configurada: ${problemas.join(' ')}`);

    const datos = { fecha: fechaDesdeISO(hoySantiago()), motivo, neto: f.neto, iva: f.iva, total: f.total, creadoPorId: usuarioId ?? null };
    const nc = f.notaCredito
      ? await this.prisma.notaCredito.update({ where: { id: f.notaCredito.id }, data: datos })
      : await this.prisma.notaCredito.create({ data: { facturaMensualId: f.id, ...datos } });

    let armado: ReturnType<typeof armarNotaCredito61>;
    try {
      armado = armarNotaCredito61(
        {
          fecha: nc.fecha,
          motivo,
          cliente: f.cliente,
          factura: {
            folio: f.dteFolio,
            fechaEmision: f.fechaEmision,
            periodo: f.periodo,
            lineas: f.detalle as unknown as LineaFactura[],
            neto: Number(f.neto),
            iva: Number(f.iva),
            total: Number(f.total),
          },
        },
        this.config,
      );
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'No se pudo armar la nota de crédito electrónica');
    }

    const intento = nc.dteIntentos + 1;
    await this.prisma.notaCredito.update({ where: { id: nc.id }, data: { dteIntentos: intento } });

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-nc-${nc.id}-${intento}`, () => this.siguienteFolioSimulado(61));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`nota-credito-${nc.id}-folio-${r.folio}`, r);
      const emitida = await this.prisma.notaCredito.update({
        where: { id: nc.id },
        data: {
          dteEstado: 'EMITIDA',
          dteFolio: r.folio,
          dteAmbiente: this.proveedor.nombre,
          dteToken: r.token?.slice(0, 200) ?? null,
          dteError: armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
          dtePdfPath: pdfPath,
          dteXmlPath: xmlPath,
          dteEmitidaEn: new Date(),
          dteEmitidaPorId: usuarioId ?? null,
        },
      });
      await this.audit.registrar({
        usuarioId,
        accion: 'EMITIR_DTE',
        recurso: `factura-mensual/${f.id}/nota-credito`,
        detalle: { tipo: 61, folio: r.folio, anulaFolio: f.dteFolio, ambiente: this.proveedor.nombre, totales: armado.totales },
      });
      return emitida;
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmision ? e.message : `Error inesperado al emitir: ${e instanceof Error ? e.message : 'desconocido'}`;
      if (!(e instanceof ErrorEmision)) this.logger.error(mensaje);
      await this.prisma.notaCredito.update({ where: { id: nc.id }, data: { dteEstado: 'RECHAZADA', dteError: mensaje.slice(0, 1000) } });
      await this.audit.registrar({ usuarioId, accion: 'DTE_RECHAZADO', recurso: `factura-mensual/${f.id}/nota-credito`, detalle: { intento, mensaje } });
      throw new BadRequestException(`Nota de crédito rechazada (la factura sigue vigente): ${mensaje}`);
    }
  }

  /** Emite todas las facturas vigentes del mes ('AAAA-MM') que aún no están en el SII */
  async emitirFacturasMes(mes: string, usuarioId?: number) {
    const pendientes = await this.prisma.facturaMensual.findMany({
      where: { periodo: fechaDesdeISO(`${mes}-01`), estado: 'VIGENTE', dteEstado: { not: 'EMITIDA' } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const emitidas: { facturaId: number; folio: number | null }[] = [];
    const errores: { facturaId: number; mensaje: string }[] = [];
    for (const [i, p] of pendientes.entries()) {
      if (i > 0 && this.config.modo !== 'simulado') await new Promise((r) => setTimeout(r, 400));
      try {
        const f = await this.emitirFactura(p.id, usuarioId);
        emitidas.push({ facturaId: f.id, folio: f.dteFolio });
      } catch (e) {
        errores.push({ facturaId: p.id, mensaje: e instanceof Error ? e.message : 'Error' });
      }
    }
    return { total: pendientes.length, emitidas, errores };
  }

  /** PDF oficial de la guía electrónica */
  async pdf(guiaId: number) {
    const g = await this.prisma.guia.findUnique({ where: { id: guiaId }, select: { dtePdfPath: true, dteFolio: true } });
    if (!g?.dtePdfPath) throw new NotFoundException('Esta guía no tiene PDF de la guía electrónica');
    return { ruta: this.rutaSegura(g.dtePdfPath), nombre: `guia-despacho-electronica-${g.dteFolio}.pdf` };
  }

  /** PDF oficial de la factura electrónica */
  async pdfFactura(facturaId: number) {
    const f = await this.prisma.facturaMensual.findUnique({ where: { id: facturaId }, select: { dtePdfPath: true, dteFolio: true } });
    if (!f?.dtePdfPath) throw new NotFoundException('Esta factura no tiene PDF de la factura electrónica');
    return { ruta: this.rutaSegura(f.dtePdfPath), nombre: `factura-electronica-${f.dteFolio}.pdf` };
  }

  /** PDF oficial de la nota de crédito que anuló la factura */
  async pdfNotaCredito(facturaId: number) {
    const n = await this.prisma.notaCredito.findUnique({ where: { facturaMensualId: facturaId }, select: { dtePdfPath: true, dteFolio: true } });
    if (!n?.dtePdfPath) throw new NotFoundException('Esta factura no tiene PDF de nota de crédito');
    return { ruta: this.rutaSegura(n.dtePdfPath), nombre: `nota-credito-electronica-${n.dteFolio}.pdf` };
  }

  private rutaSegura(relativo: string): string {
    const ruta = resolve(this.dirUploads, relativo);
    if (!ruta.startsWith(this.dirUploads)) throw new NotFoundException('Archivo no encontrado');
    return ruta;
  }

  private async guardarArchivos(base: string, r: ResultadoEmision) {
    return {
      pdfPath: r.pdfBase64 ? await this.guardar(`${base}.pdf`, r.pdfBase64) : null,
      xmlPath: r.xmlBase64 ? await this.guardar(`${base}.xml`, r.xmlBase64) : null,
    };
  }

  private async guardar(nombre: string, base64: string): Promise<string> {
    const relativo = join('dte', nombre);
    await mkdir(join(this.dirUploads, 'dte'), { recursive: true });
    await writeFile(join(this.dirUploads, relativo), Buffer.from(base64, 'base64'));
    return relativo;
  }

  /** Folio simulado correlativo, separado por tipo de documento (52 guía, 33 factura, 61 nota de crédito) */
  private async siguienteFolioSimulado(tipo: 52 | 33 | 61): Promise<number> {
    const where = { dteAmbiente: 'SIMULADO' };
    const max =
      tipo === 52
        ? (await this.prisma.guia.aggregate({ where, _max: { dteFolio: true } }))._max.dteFolio
        : tipo === 33
          ? (await this.prisma.facturaMensual.aggregate({ where, _max: { dteFolio: true } }))._max.dteFolio
          : (await this.prisma.notaCredito.aggregate({ where, _max: { dteFolio: true } }))._max.dteFolio;
    return (max ?? 0) + 1;
  }
}
