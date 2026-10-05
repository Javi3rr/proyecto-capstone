import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, fechaDesdeISO, hoySantiago } from '../common/utils';
import { registrarMovimiento } from '../inventario/movimientos';
import { PrismaService } from '../prisma/prisma.service';
import { CrearFacturaDto } from './dto/factura.dto';

const TASA_IVA = 0.19;
export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

/** Archivo recibido por multer (memoria) */
export interface ArchivoSubido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Tipos aceptados, reconocidos por su firma binaria (no por la extensión) */
function tipoReal(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png' };
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP')
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const INCLUDE_LISTA = {
  proveedor: { select: { id: true, rut: true, razonSocial: true } },
  _count: { select: { detalles: true } },
} as const;

/**
 * Facturas de mercadería.
 *  - Registrar una factura suma al stock cada línea (movimiento ENTRADA_FACTURA).
 *  - No se edita: se anula con motivo y la anulación descuenta lo que había sumado (ANULACION_FACTURA).
 *  - No se puede registrar dos veces la misma factura (proveedor + N°).
 */
@Injectable()
export class FacturasService {
  private readonly dirUploads = resolve(process.env.UPLOADS_DIR ?? './uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(filtro: { desde?: string; hasta?: string; proveedorId?: number; numero?: string; incluirAnuladas?: boolean }) {
    return this.prisma.factura.findMany({
      where: {
        fecha: {
          gte: filtro.desde ? fechaDesdeISO(filtro.desde) : undefined,
          lte: filtro.hasta ? fechaDesdeISO(filtro.hasta) : undefined,
        },
        proveedorId: filtro.proveedorId,
        numero: filtro.numero ? { contains: filtro.numero, mode: 'insensitive' } : undefined,
        estado: filtro.incluirAnuladas ? undefined : 'VIGENTE',
      },
      include: INCLUDE_LISTA,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async obtener(id: number) {
    const f = await this.prisma.factura.findUnique({
      where: { id },
      include: {
        ...INCLUDE_LISTA,
        detalles: {
          include: { producto: { select: { id: true, plu: true, nombre: true, unidad: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!f) throw new NotFoundException('Factura no encontrada');
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [f.creadoPorId, f.anuladaPorId].filter((x): x is number => x !== null) } },
      select: { id: true, username: true },
    });
    const nombre = (id: number | null) => usuarios.find((u) => u.id === id)?.username ?? null;
    return { ...f, creadoPor: nombre(f.creadoPorId), anuladaPor: nombre(f.anuladaPorId) };
  }

  async crear(dto: CrearFacturaDto, usuarioId?: number) {
    if (dto.fecha > hoySantiago()) throw new BadRequestException('La fecha de la factura no puede ser futura');

    const proveedor = await this.prisma.proveedor.findUnique({ where: { id: dto.proveedorId } });
    if (!proveedor || !proveedor.activo) throw new BadRequestException('Proveedor no encontrado o desactivado');

    const ids = [...new Set(dto.lineas.map((l) => l.productoId))];
    const productos = await this.prisma.producto.findMany({ where: { id: { in: ids }, activo: true }, select: { id: true } });
    if (productos.length !== ids.length) throw new BadRequestException('Una o más líneas tienen un producto inexistente o desactivado');

    const lineas = dto.lineas.map((l) => {
      const cantidad = new Prisma.Decimal(l.cantidad);
      const costo = new Prisma.Decimal(l.costoUnitario);
      return { productoId: l.productoId, cantidad, costoUnitario: costo, subtotal: cantidad.mul(costo).toDecimalPlaces(0) };
    });
    const neto = lineas.reduce((t, l) => t.plus(l.subtotal), new Prisma.Decimal(0));
    const iva = dto.iva !== undefined ? new Prisma.Decimal(dto.iva) : neto.mul(TASA_IVA).toDecimalPlaces(0);
    const total = neto.plus(iva);

    try {
      const factura = await this.prisma.$transaction(async (tx) => {
        const f = await tx.factura.create({
          data: {
            proveedorId: dto.proveedorId,
            numero: dto.numero.toUpperCase(),
            fecha: fechaDesdeISO(dto.fecha),
            neto,
            iva,
            total,
            observacion: dto.observacion ?? null,
            creadoPorId: usuarioId ?? null,
            detalles: { create: lineas },
          },
        });
        for (const l of lineas) {
          await registrarMovimiento(tx, {
            productoId: l.productoId,
            tipo: 'ENTRADA_FACTURA',
            cantidad: l.cantidad,
            origenTipo: 'FACTURA',
            origenId: f.id,
            motivo: `Factura N° ${f.numero} · ${proveedor.razonSocial}`,
            usuarioId,
          });
        }
        return f;
      });
      const completa = await this.obtener(factura.id);
      await this.audit.registrarCambio(usuarioId, 'CREAR', 'factura', factura.id, null, completa);
      return completa;
    } catch (e) {
      if (esErrorUnico(e)) {
        throw new ConflictException(`La factura N° ${dto.numero} de ${proveedor.razonSocial} ya está registrada`);
      }
      throw e;
    }
  }

  /** Anula la factura y revierte el stock que había sumado (sin borrar el historial) */
  async anular(id: number, motivo: string, usuarioId?: number) {
    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new ConflictException('La factura ya está anulada');

    await this.prisma.$transaction(async (tx) => {
      // Marca primero: si dos personas anulan a la vez, solo una pasa este filtro
      const r = await tx.factura.updateMany({
        where: { id, estado: 'VIGENTE' },
        data: { estado: 'ANULADA', motivoAnulacion: motivo, anuladaPorId: usuarioId ?? null, anuladaEn: new Date() },
      });
      if (r.count === 0) throw new ConflictException('La factura ya está anulada');
      for (const d of antes.detalles) {
        await registrarMovimiento(tx, {
          productoId: d.productoId,
          tipo: 'ANULACION_FACTURA',
          cantidad: new Prisma.Decimal(d.cantidad).neg(),
          origenTipo: 'FACTURA',
          origenId: id,
          motivo: `Anulación factura N° ${antes.numero}: ${motivo}`,
          usuarioId,
        });
      }
    });

    const despues = await this.obtener(id);
    await this.audit.registrarCambio(usuarioId, 'ANULAR', 'factura', id, antes, despues);
    return despues;
  }

  /** Guarda (o reemplaza) la foto o PDF de la factura en el volumen de uploads */
  async adjuntar(id: number, archivo: ArchivoSubido | undefined, usuarioId?: number) {
    if (!archivo) throw new BadRequestException('Seleccione un archivo (PDF, JPG, PNG o WEBP)');
    if (archivo.size > MAX_ARCHIVO_BYTES) throw new BadRequestException('El archivo supera los 10 MB');
    const tipo = tipoReal(archivo.buffer);
    if (!tipo) throw new BadRequestException('Formato no permitido: use PDF, JPG, PNG o WEBP');

    const antes = await this.obtener(id);
    if (antes.estado === 'ANULADA') throw new BadRequestException('No se pueden adjuntar archivos a una factura anulada');

    // El archivo anterior se conserva en disco (trazabilidad); solo cambia la referencia
    const relativo = join('facturas', `${id}-${Date.now()}.${tipo.ext}`);
    await mkdir(join(this.dirUploads, 'facturas'), { recursive: true });
    await writeFile(join(this.dirUploads, relativo), archivo.buffer);

    await this.prisma.factura.update({
      where: { id },
      data: {
        archivoPath: relativo,
        archivoNombre: archivo.originalname.slice(0, 255),
        archivoTipo: tipo.mime,
      },
    });
    const despues = await this.obtener(id);
    await this.audit.registrarCambio(
      usuarioId,
      'ADJUNTAR',
      'factura',
      id,
      { archivoNombre: antes.archivoNombre, archivoPath: antes.archivoPath },
      { archivoNombre: despues.archivoNombre, archivoPath: despues.archivoPath },
    );
    return despues;
  }

  /** Ruta absoluta y tipo del archivo adjunto (para enviarlo al navegador) */
  async archivo(id: number) {
    const f = await this.prisma.factura.findUnique({
      where: { id },
      select: { archivoPath: true, archivoNombre: true, archivoTipo: true },
    });
    if (!f?.archivoPath) throw new NotFoundException('La factura no tiene archivo adjunto');
    const ruta = resolve(this.dirUploads, f.archivoPath);
    if (!ruta.startsWith(this.dirUploads)) throw new NotFoundException('Archivo no encontrado');
    return { ruta, nombre: f.archivoNombre ?? 'factura', tipo: f.archivoTipo ?? 'application/octet-stream' };
  }
}
