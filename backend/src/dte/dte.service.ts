import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO, hoySantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigDte, leerConfigDte, problemasConfig } from './dte.config';
import type { LineaFactura } from '../facturacion/calculo';
import { armarFactura33 } from './factura33';
import { camposDte, datosEmision, DTE_SIN_EMITIR, esSoloInterna, GUIA_VA_AL_SII, guiaApi, INCLUDE_GUIA_COMPLETA } from './documento-sii';
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
        documentoSii: true,
        // Cliente, repartidor, fecha y vuelta vienen del despacho de la guía
        despacho: {
          select: {
            vuelta: true,
            jornada: { select: { fecha: true } },
            cliente: { select: { nombre: true, modalidad: true, rut: true, razonSocial: true, giro: true, direccion: true, comuna: true } },
            repartidor: { select: { nombre: true, rut: true, patente: true } },
          },
        },
        reemplazaA: { select: { documentoSii: true, despacho: { select: { jornada: { select: { fecha: true } } } } } },
      },
    });
    if (!g) throw new NotFoundException('Guía no encontrada');
    // Corrección: se referencia la guía anulada solo si tiene folio en este mismo ambiente (un folio de pruebas no existe en producción)
    const docAnulada = g.reemplazaA?.documentoSii;
    const reemplaza =
      docAnulada?.estado === 'EMITIDA' && docAnulada.folio && docAnulada.ambiente === this.proveedor.nombre
        ? { folio: docAnulada.folio, fecha: g.reemplazaA!.despacho.jornada.fecha }
        : null;
    if (g.estado === 'ANULADA') throw new ConflictException(`La guía N° ${g.id} está anulada`);
    if (esSoloInterna(g.despacho.cliente.modalidad)) {
      throw new BadRequestException(
        `La guía N° ${g.id} es de un cliente presencial: retira en la panadería y su guía es solo interna (no se envía al SII).`,
      );
    }
    if (g.documentoSii?.estado === 'EMITIDA') {
      throw new ConflictException(`La guía N° ${g.id} ya tiene la guía electrónica folio ${g.documentoSii.folio}`);
    }

    const armado = this.armar({
      id: g.id,
      fecha: g.despacho.jornada.fecha,
      vuelta: g.despacho.vuelta,
      kg: Number(g.kg),
      kgDescuento: Number(g.kgDescuento),
      precioKg: Number(g.precioKg),
      monto: Number(g.monto),
      cliente: g.despacho.cliente,
      repartidor: g.despacho.repartidor,
      reemplaza,
    });

    const doc = await this.registrarIntento(52, g.documentoSii, (documentoSiiId) =>
      this.prisma.guia.update({ where: { id: g.id }, data: { documentoSiiId } }),
    );
    const intento = doc.intentos;

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-guia-${g.id}-${intento}`, () => this.siguienteFolioSimulado(52));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`guia-${g.id}-folio-${r.folio}`, r);
      const avisos = [
        armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
        ...armado.avisos,
      ].filter(Boolean);
      await this.prisma.documentoSii.update({
        where: { id: doc.id },
        data: datosEmision({ ...r, ambiente: this.proveedor.nombre, error: avisos.length ? avisos.join(' ') : null, pdfPath, xmlPath, usuarioId }),
      });
      const actualizada = guiaApi(await this.prisma.guia.findUniqueOrThrow({ where: { id: g.id }, include: INCLUDE_GUIA_COMPLETA }));
      await this.audit.registrar({
        usuarioId,
        accion: 'EMITIR_DTE',
        recurso: `guia/${g.id}`,
        detalle: {
          folio: r.folio,
          ambiente: this.proveedor.nombre,
          totales: armado.totales,
          receptorDePrueba: armado.receptorDePrueba,
          ...(reemplaza ? { reemplazaFolio: reemplaza.folio } : {}),
        },
      });
      return actualizada;
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmision ? e.message : `Error inesperado al emitir: ${e instanceof Error ? e.message : 'desconocido'}`;
      if (!(e instanceof ErrorEmision)) this.logger.error(mensaje);
      await this.prisma.documentoSii.update({ where: { id: doc.id }, data: { estado: 'RECHAZADA', error: mensaje.slice(0, 1000) } });
      await this.audit.registrar({ usuarioId, accion: 'DTE_RECHAZADO', recurso: `guia/${g.id}`, detalle: { intento, mensaje } });
      throw new BadRequestException(mensaje);
    }
  }

  /** Emite todas las guías vigentes del día que aún no están en el SII (una por una, respetando el límite del proveedor) */
  async emitirDia(fecha: string, usuarioId?: number) {
    const pendientes = await this.prisma.guia.findMany({
      where: { AND: [{ despacho: { jornada: { fecha: fechaDesdeISO(fecha) } } }, GUIA_VA_AL_SII], estado: 'VIGENTE', ...DTE_SIN_EMITIR },
      select: { id: true },
      orderBy: [{ despacho: { vuelta: 'asc' } }, { id: 'asc' }],
    });
    return this.emitirVarias(pendientes.map((p) => p.id), usuarioId);
  }

  /**
   * Emite en el SII las guías indicadas que aún no tienen folio, antes de imprimir la vuelta (Res. SII 144/2026:
   * la guía debe estar en el SII antes de que salga el reparto). Si la emisión no está configurada no emite nada
   * e informa el motivo en "omitida": las guías se imprimen igual, marcadas sin folio.
   */
  async emitirGuias(ids: number[], usuarioId?: number) {
    const problemas = problemasConfig(this.config);
    if (problemas.length) {
      return { total: 0, emitidas: [], errores: [], omitida: `Emisión electrónica no configurada: ${problemas.join(' ')}` };
    }
    const pendientes = await this.prisma.guia.findMany({
      // Las guías de clientes presenciales se imprimen como guía interna: no se envían
      where: { id: { in: ids }, estado: 'VIGENTE', AND: [DTE_SIN_EMITIR, GUIA_VA_AL_SII] },
      select: { id: true },
    });
    const orden = new Map(ids.map((id, i) => [id, i]));
    const enOrden = pendientes.map((p) => p.id).sort((a, b) => (orden.get(a) ?? 0) - (orden.get(b) ?? 0));
    return { ...(await this.emitirVarias(enOrden, usuarioId)), omitida: null };
  }

  /** Emite una por una, con una pausa entre envíos por el límite de solicitudes del proveedor */
  private async emitirVarias(ids: number[], usuarioId?: number) {
    const pendientes = ids.map((id) => ({ id }));
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
        documentoSii: true,
        guias: {
          select: {
            id: true,
            documentoSii: true,
            despacho: { select: { jornada: { select: { fecha: true } }, cliente: { select: { modalidad: true } } } },
          },
        },
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    if (f.estado === 'ANULADA') throw new ConflictException(`La factura N° ${f.id} está anulada`);
    if (f.documentoSii?.estado === 'EMITIDA') throw new ConflictException(`La factura N° ${f.id} ya tiene folio ${f.documentoSii.folio} en el SII`);

    // La factura referencia sus guías electrónicas: deben estar emitidas en el mismo ambiente (un folio de pruebas
    // no existe en producción). Las guías de clientes presenciales son solo internas: se cobran sin referencia.
    const electronicas = f.guias.filter((g) => !esSoloInterna(g.despacho.cliente.modalidad));
    const conFolio = electronicas
      .map((g) => ({ ...camposDte(g.documentoSii), fecha: g.despacho.jornada.fecha }))
      .filter((g) => g.dteEstado === 'EMITIDA' && g.dteFolio && g.dteAmbiente === this.proveedor.nombre);
    const sinFolio = electronicas.length - conFolio.length;
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

    const doc = await this.registrarIntento(33, f.documentoSii, (documentoSiiId) =>
      this.prisma.facturaMensual.update({ where: { id: f.id }, data: { documentoSiiId } }),
    );
    const intento = doc.intentos;

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-factura-${f.id}-${intento}`, () => this.siguienteFolioSimulado(33));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`factura-${f.id}-folio-${r.folio}`, r);
      const emitido = await this.prisma.documentoSii.update({
        where: { id: doc.id },
        data: datosEmision({
          ...r,
          ambiente: this.proveedor.nombre,
          error: armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
          pdfPath,
          xmlPath,
          usuarioId,
        }),
      });
      const { documentoSii: _doc, guias: _guias, cliente: _cliente, ...datosFactura } = f;
      const actualizada = { ...datosFactura, documentoSiiId: emitido.id, ...camposDte(emitido) };
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
      await this.prisma.documentoSii.update({ where: { id: doc.id }, data: { estado: 'RECHAZADA', error: mensaje.slice(0, 1000) } });
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
        documentoSii: true,
        notaCredito: { include: { documentoSii: true } },
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    if (f.estado === 'ANULADA') throw new ConflictException(`La factura N° ${f.id} ya está anulada`);
    const docFactura = f.documentoSii;
    if (docFactura?.estado !== 'EMITIDA' || !docFactura.folio) return null;
    // Ya se anuló en el SII en un intento anterior: solo falta anularla en el sistema
    if (f.notaCredito?.documentoSii?.estado === 'EMITIDA') return { ...f.notaCredito, ...camposDte(f.notaCredito.documentoSii) };
    if (docFactura.ambiente !== this.proveedor.nombre) {
      if (docFactura.ambiente === 'PRODUCCION') {
        throw new BadRequestException(
          `La factura N° ${f.id} tiene folio ${docFactura.folio} de producción: su nota de crédito solo se puede emitir con la emisión en producción.`,
        );
      }
      return null;
    }
    const problemas = problemasConfig(this.config);
    if (problemas.length) throw new BadRequestException(`Emisión electrónica no configurada: ${problemas.join(' ')}`);

    // La nota de crédito anula la factura completa: sus montos son los de la factura
    const datos = { fecha: fechaDesdeISO(hoySantiago()), motivo, creadoPorId: usuarioId ?? null };
    const nc = f.notaCredito
      ? await this.prisma.notaCredito.update({ where: { id: f.notaCredito.id }, data: datos, include: { documentoSii: true } })
      : await this.prisma.notaCredito.create({ data: { facturaMensualId: f.id, ...datos }, include: { documentoSii: true } });

    let armado: ReturnType<typeof armarNotaCredito61>;
    try {
      armado = armarNotaCredito61(
        {
          fecha: nc.fecha,
          motivo,
          cliente: f.cliente,
          factura: {
            folio: docFactura.folio,
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

    const doc = await this.registrarIntento(61, nc.documentoSii, (documentoSiiId) =>
      this.prisma.notaCredito.update({ where: { id: nc.id }, data: { documentoSiiId } }),
    );
    const intento = doc.intentos;

    try {
      const r = await this.proveedor.emitir(armado.dte, `patopan-nc-${nc.id}-${intento}`, () => this.siguienteFolioSimulado(61));
      const { pdfPath, xmlPath } = await this.guardarArchivos(`nota-credito-${nc.id}-folio-${r.folio}`, r);
      const emitido = await this.prisma.documentoSii.update({
        where: { id: doc.id },
        data: datosEmision({
          ...r,
          ambiente: this.proveedor.nombre,
          error: armado.receptorDePrueba ? 'Emitida con receptor de prueba: el cliente no tiene RUT registrado.' : null,
          pdfPath,
          xmlPath,
          usuarioId,
        }),
      });
      await this.audit.registrar({
        usuarioId,
        accion: 'EMITIR_DTE',
        recurso: `factura-mensual/${f.id}/nota-credito`,
        detalle: { tipo: 61, folio: r.folio, anulaFolio: docFactura.folio, ambiente: this.proveedor.nombre, totales: armado.totales },
      });
      const { documentoSii: _doc, ...datosNc } = nc;
      return { ...datosNc, documentoSiiId: emitido.id, ...camposDte(emitido) };
    } catch (e) {
      const mensaje =
        e instanceof ErrorEmision ? e.message : `Error inesperado al emitir: ${e instanceof Error ? e.message : 'desconocido'}`;
      if (!(e instanceof ErrorEmision)) this.logger.error(mensaje);
      await this.prisma.documentoSii.update({ where: { id: doc.id }, data: { estado: 'RECHAZADA', error: mensaje.slice(0, 1000) } });
      await this.audit.registrar({ usuarioId, accion: 'DTE_RECHAZADO', recurso: `factura-mensual/${f.id}/nota-credito`, detalle: { intento, mensaje } });
      throw new BadRequestException(`Nota de crédito rechazada (la factura sigue vigente): ${mensaje}`);
    }
  }

  /** Emite todas las facturas vigentes del mes ('AAAA-MM') que aún no están en el SII */
  async emitirFacturasMes(mes: string, usuarioId?: number) {
    const pendientes = await this.prisma.facturaMensual.findMany({
      where: { periodo: fechaDesdeISO(`${mes}-01`), estado: 'VIGENTE', ...DTE_SIN_EMITIR },
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
    const g = await this.prisma.guia.findUnique({ where: { id: guiaId }, select: { documentoSii: { select: { pdfPath: true, folio: true } } } });
    const doc = g?.documentoSii;
    if (!doc?.pdfPath) throw new NotFoundException('Esta guía no tiene PDF de la guía electrónica');
    return { ruta: this.rutaSegura(doc.pdfPath), nombre: `guia-despacho-electronica-${doc.folio}.pdf` };
  }

  /**
   * Un solo PDF con las guías electrónicas timbradas de las guías indicadas, en ese orden, para imprimir la vuelta.
   * Solo incluye guías vigentes con PDF del proveedor (el modo simulado no entrega PDF).
   */
  async pdfLote(ids: number[]): Promise<{ pdf: Buffer; incluidas: number[] }> {
    const guias = await this.prisma.guia.findMany({
      where: { id: { in: ids }, estado: 'VIGENTE', documentoSii: { is: { estado: 'EMITIDA', pdfPath: { not: null } } } },
      select: { id: true, documentoSii: { select: { pdfPath: true } } },
    });
    if (guias.length === 0) throw new NotFoundException('Ninguna de estas guías tiene PDF timbrado');
    const orden = new Map(ids.map((id, i) => [id, i]));
    guias.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));

    const salida = await PDFDocument.create();
    const incluidas: number[] = [];
    for (const g of guias) {
      try {
        const origen = await PDFDocument.load(await readFile(this.rutaSegura(g.documentoSii!.pdfPath!)));
        const paginas = await salida.copyPages(origen, origen.getPageIndices());
        paginas.forEach((p) => salida.addPage(p));
        incluidas.push(g.id);
      } catch (e) {
        this.logger.warn(`No se pudo agregar el PDF de la guía N° ${g.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (incluidas.length === 0) throw new NotFoundException('No se pudieron leer los PDF timbrados');
    return { pdf: Buffer.from(await salida.save()), incluidas };
  }

  /** PDF oficial de la factura electrónica */
  async pdfFactura(facturaId: number) {
    const f = await this.prisma.facturaMensual.findUnique({ where: { id: facturaId }, select: { documentoSii: { select: { pdfPath: true, folio: true } } } });
    const doc = f?.documentoSii;
    if (!doc?.pdfPath) throw new NotFoundException('Esta factura no tiene PDF de la factura electrónica');
    return { ruta: this.rutaSegura(doc.pdfPath), nombre: `factura-electronica-${doc.folio}.pdf` };
  }

  /** PDF oficial de la nota de crédito que anuló la factura */
  async pdfNotaCredito(facturaId: number) {
    const n = await this.prisma.notaCredito.findUnique({
      where: { facturaMensualId: facturaId },
      select: { documentoSii: { select: { pdfPath: true, folio: true } } },
    });
    const doc = n?.documentoSii;
    if (!doc?.pdfPath) throw new NotFoundException('Esta factura no tiene PDF de nota de crédito');
    return { ruta: this.rutaSegura(doc.pdfPath), nombre: `nota-credito-electronica-${doc.folio}.pdf` };
  }

  /**
   * Suma un intento de envío al documento SII; si es el primer intento, crea el documento y lo asocia
   * (a la guía, factura o nota de crédito) con la función "asociar".
   */
  private async registrarIntento(
    tipo: 52 | 33 | 61,
    actual: { id: number } | null,
    asociar: (documentoSiiId: number) => Promise<unknown>,
  ) {
    if (actual) return this.prisma.documentoSii.update({ where: { id: actual.id }, data: { intentos: { increment: 1 } } });
    const nuevo = await this.prisma.documentoSii.create({ data: { tipo, intentos: 1 } });
    await asociar(nuevo.id);
    return nuevo;
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
    const max = (await this.prisma.documentoSii.aggregate({ where: { tipo, ambiente: 'SIMULADO' }, _max: { folio: true } }))._max.folio;
    return (max ?? 0) + 1;
  }
}
