import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { fechaDesdeISO } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigDte, leerConfigDte, problemasConfig } from './dte.config';
import { armarGuia52, GuiaParaDte } from './guia52';
import { ErrorEmision, ProveedorDte, ProveedorOpenFactura, ProveedorSimulado } from './proveedores';

const NOMBRE_AMBIENTE = { simulado: 'Simulado (sin conexión)', pruebas: 'Pruebas del proveedor (sin efecto tributario)', produccion: 'Producción SII' };

/**
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
      const r = await this.proveedor.emitir(armado.dte, `patopan-guia-${g.id}-${intento}`, () => this.siguienteFolioSimulado());
      const base = `guia-${g.id}-folio-${r.folio}`;
      const pdfPath = r.pdfBase64 ? await this.guardar(`${base}.pdf`, r.pdfBase64) : null;
      const xmlPath = r.xmlBase64 ? await this.guardar(`${base}.xml`, r.xmlBase64) : null;
      const actualizada = await this.prisma.guia.update({
        where: { id: g.id },
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

  /** PDF oficial de la guía electrónica */
  async pdf(guiaId: number) {
    const g = await this.prisma.guia.findUnique({ where: { id: guiaId }, select: { dtePdfPath: true, dteFolio: true } });
    if (!g?.dtePdfPath) throw new NotFoundException('Esta guía no tiene PDF de la guía electrónica');
    const ruta = resolve(this.dirUploads, g.dtePdfPath);
    if (!ruta.startsWith(this.dirUploads)) throw new NotFoundException('Archivo no encontrado');
    return { ruta, nombre: `guia-despacho-electronica-${g.dteFolio}.pdf` };
  }

  private async guardar(nombre: string, base64: string): Promise<string> {
    const relativo = join('dte', nombre);
    await mkdir(join(this.dirUploads, 'dte'), { recursive: true });
    await writeFile(join(this.dirUploads, relativo), Buffer.from(base64, 'base64'));
    return relativo;
  }

  private async siguienteFolioSimulado(): Promise<number> {
    const max = await this.prisma.guia.aggregate({ where: { dteAmbiente: 'SIMULADO' }, _max: { dteFolio: true } });
    return (max._max.dteFolio ?? 0) + 1;
  }
}
