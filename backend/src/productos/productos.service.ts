import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaProducto, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarProductoDto, CrearProductoDto } from './dto/producto.dto';

/**
 * Catálogo de productos del mesón (pan, cecinas y mercadería).
 * El stock NO se edita aquí: solo cambia con movimientos (facturas, ventas de balanza, ajustes).
 */
@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listar(filtro: { incluirInactivos?: boolean; categoria?: CategoriaProducto; texto?: string }) {
    const texto = filtro.texto?.trim();
    return this.prisma.producto.findMany({
      where: {
        activo: filtro.incluirInactivos ? undefined : true,
        categoria: filtro.categoria,
        OR: texto
          ? [{ nombre: { contains: texto, mode: 'insensitive' } }, { plu: { startsWith: texto } }]
          : undefined,
      },
      orderBy: [{ activo: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }],
    });
  }

  async obtener(id: number) {
    const p = await this.prisma.producto.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async crear(dto: CrearProductoDto, usuarioId?: number) {
    try {
      const creado = await this.prisma.producto.create({
        data: {
          plu: dto.plu.toUpperCase(),
          nombre: dto.nombre,
          categoria: dto.categoria,
          unidad: dto.unidad,
          precioVenta: new Prisma.Decimal(dto.precioVenta),
          stockMinimo: new Prisma.Decimal(dto.stockMinimo ?? 0),
        },
      });
      await this.audit.registrarCambio(usuarioId, 'CREAR', 'producto', creado.id, null, creado);
      return creado;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException(`Ya existe un producto con el PLU ${dto.plu}`);
      throw e;
    }
  }

  async actualizar(id: number, dto: ActualizarProductoDto, usuarioId?: number) {
    const antes = await this.obtener(id);
    try {
      const despues = await this.prisma.producto.update({
        where: { id },
        data: {
          plu: dto.plu?.toUpperCase(),
          nombre: dto.nombre,
          categoria: dto.categoria,
          unidad: dto.unidad,
          precioVenta: dto.precioVenta === undefined ? undefined : new Prisma.Decimal(dto.precioVenta),
          stockMinimo: dto.stockMinimo === undefined ? undefined : new Prisma.Decimal(dto.stockMinimo),
          activo: dto.activo,
        },
      });
      const accion =
        dto.activo === false && antes.activo
          ? 'DESACTIVAR'
          : dto.activo === true && !antes.activo
            ? 'REACTIVAR'
            : 'ACTUALIZAR';
      await this.audit.registrarCambio(usuarioId, accion, 'producto', id, antes, despues);
      return despues;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException(`Ya existe un producto con el PLU ${dto.plu}`);
      throw e;
    }
  }

  /** Eliminación lógica: conserva su historial de movimientos */
  desactivar(id: number, usuarioId?: number) {
    return this.actualizar(id, { activo: false }, usuarioId);
  }
}
