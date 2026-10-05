import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaProducto, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { instanteSantiago } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CrearConteoDto, MotivoAjuste } from './dto/conteo.dto';
import { registrarMovimiento } from './movimientos';

const NOMBRE_MOTIVO: Record<MotivoAjuste, string> = {
  MERMA: 'Merma',
  VENCIMIENTO: 'Vencimiento',
  PERDIDA: 'Pérdida',
  ERROR_REGISTRO: 'Error de registro',
  OTRO: 'Otro',
};

export type EstadoStock = 'SIN_STOCK' | 'BAJO' | 'OK';

/**
 * Inventario del mesón: stock actual con alertas, kardex por producto y conteos físicos.
 * Todo cambio de stock pasa por registrarMovimiento (queda en el kardex con usuario y motivo).
 */
@Injectable()
export class InventarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Stock actual de los productos activos, con su estado frente al mínimo */
  async stock(filtro: { categoria?: CategoriaProducto; texto?: string; soloAlertas?: boolean }) {
    const texto = filtro.texto?.trim();
    const [productos, ultimos] = await Promise.all([
      this.prisma.producto.findMany({
        where: {
          activo: true,
          categoria: filtro.categoria,
          OR: texto ? [{ nombre: { contains: texto, mode: 'insensitive' } }, { plu: { startsWith: texto } }] : undefined,
        },
        orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
      }),
      this.prisma.movimientoStock.groupBy({ by: ['productoId'], _max: { creadoEn: true } }),
    ]);
    const ultimo = new Map(ultimos.map((u) => [u.productoId, u._max.creadoEn]));

    const filas = productos.map((p) => {
      const actual = Number(p.stockActual);
      const minimo = Number(p.stockMinimo);
      const estado: EstadoStock = actual <= 0 ? 'SIN_STOCK' : minimo > 0 && actual < minimo ? 'BAJO' : 'OK';
      return {
        id: p.id,
        plu: p.plu,
        nombre: p.nombre,
        categoria: p.categoria,
        unidad: p.unidad,
        precioVenta: Number(p.precioVenta),
        stockActual: actual,
        stockMinimo: minimo,
        /** Cuánto falta para llegar al mínimo */
        faltante: minimo > actual ? Math.round((minimo - actual) * 1000) / 1000 : 0,
        estado,
        ultimoMovimiento: ultimo.get(p.id) ?? null,
      };
    });

    return {
      resumen: {
        productos: filas.length,
        sinStock: filas.filter((f) => f.estado === 'SIN_STOCK').length,
        bajo: filas.filter((f) => f.estado === 'BAJO').length,
      },
      filas: filtro.soloAlertas ? filas.filter((f) => f.estado !== 'OK') : filas,
    };
  }

  /** Kardex: todos los movimientos de un producto en un período, con saldo inicial y final */
  async kardex(productoId: number, desde?: string, hasta?: string) {
    const producto = await this.prisma.producto.findUnique({ where: { id: productoId } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (desde && hasta && desde > hasta) throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta"');

    const inicio = desde ? instanteSantiago(desde) : undefined;
    const fin = hasta ? instanteSantiago(hasta, '23:59:59.999') : undefined;

    const [anterior, movimientos] = await Promise.all([
      inicio
        ? this.prisma.movimientoStock.findFirst({
            where: { productoId, creadoEn: { lt: inicio } },
            orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
            select: { saldoResultante: true },
          })
        : Promise.resolve(null),
      this.prisma.movimientoStock.findMany({
        where: { productoId, creadoEn: { gte: inicio, lte: fin } },
        orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
        take: 5000,
      }),
    ]);

    const idsUsuarios = [...new Set(movimientos.map((m) => m.usuarioId).filter((x): x is number => x !== null))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: idsUsuarios } },
      select: { id: true, username: true },
    });
    const nombre = new Map(usuarios.map((u) => [u.id, u.username]));

    const filas = movimientos.map((m) => ({
      id: m.id.toString(),
      fecha: m.creadoEn,
      tipo: m.tipo,
      cantidad: Number(m.cantidad),
      saldo: Number(m.saldoResultante),
      origenTipo: m.origenTipo,
      origenId: m.origenId,
      motivo: m.motivo,
      codigoMesonera: m.codigoMesonera,
      usuario: m.usuarioId ? (nombre.get(m.usuarioId) ?? null) : null,
    }));
    const redondear = (n: number) => Math.round(n * 1000) / 1000;

    return {
      producto: {
        id: producto.id,
        plu: producto.plu,
        nombre: producto.nombre,
        unidad: producto.unidad,
        stockActual: Number(producto.stockActual),
      },
      desde: desde ?? null,
      hasta: hasta ?? null,
      saldoInicial: anterior ? Number(anterior.saldoResultante) : 0,
      saldoFinal: filas.length ? filas[filas.length - 1].saldo : anterior ? Number(anterior.saldoResultante) : 0,
      entradas: redondear(filas.filter((f) => f.cantidad > 0).reduce((t, f) => t + f.cantidad, 0)),
      salidas: redondear(filas.filter((f) => f.cantidad < 0).reduce((t, f) => t + f.cantidad, 0)),
      movimientos: filas,
    };
  }

  /**
   * Registra un conteo físico. Para cada producto:
   *   diferencia = contado − stock del sistema (en el momento de guardar).
   *   Si hay diferencia, exige motivo y genera un ajuste (positivo o negativo) en el kardex.
   */
  async crearConteo(dto: CrearConteoDto, usuarioId?: number) {
    const ids = dto.lineas.map((l) => l.productoId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay productos repetidos en el conteo');

    const conteo = await this.prisma.$transaction(async (tx) => {
      const productos = await tx.producto.findMany({ where: { id: { in: ids }, activo: true } });
      if (productos.length !== ids.length) throw new BadRequestException('Uno o más productos no existen o están desactivados');
      const porId = new Map(productos.map((p) => [p.id, p]));

      const detalles = dto.lineas.map((l) => {
        const p = porId.get(l.productoId)!;
        const esperado = new Prisma.Decimal(p.stockActual);
        const contado = new Prisma.Decimal(l.stockContado);
        const diferencia = contado.minus(esperado);
        if (p.unidad === 'UNIDAD' && !contado.isInteger()) {
          throw new BadRequestException(`"${p.nombre}" se cuenta por unidad: la cantidad debe ser entera`);
        }
        if (!diferencia.isZero() && !l.motivo) {
          throw new BadRequestException(`"${p.nombre}" tiene diferencia (${diferencia.toString()}): indique el motivo`);
        }
        const motivo = diferencia.isZero()
          ? null
          : `${NOMBRE_MOTIVO[l.motivo!]}${l.detalle ? ': ' + l.detalle : ''}`.slice(0, 255);
        return { producto: p, esperado, contado, diferencia, motivo };
      });

      const c = await tx.conteoInventario.create({
        data: {
          observacion: dto.observacion ?? null,
          usuarioId: usuarioId ?? null,
          detalles: {
            create: detalles.map((d) => ({
              productoId: d.producto.id,
              stockEsperado: d.esperado,
              stockContado: d.contado,
              diferencia: d.diferencia,
              motivo: d.motivo,
            })),
          },
        },
      });

      for (const d of detalles) {
        if (d.diferencia.isZero()) continue;
        await registrarMovimiento(tx, {
          productoId: d.producto.id,
          tipo: d.diferencia.isPositive() ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
          cantidad: d.diferencia,
          origenTipo: 'CONTEO',
          origenId: c.id,
          motivo: `Conteo N° ${c.id} · ${d.motivo}`,
          usuarioId,
        });
      }
      return c;
    });

    const completo = await this.obtenerConteo(conteo.id);
    await this.audit.registrarCambio(usuarioId, 'CREAR', 'conteo', conteo.id, null, {
      observacion: completo.observacion,
      productos: completo.resumen.productos,
      conDiferencia: completo.resumen.conDiferencia,
      detalles: completo.detalles.map((d) => ({
        producto: d.producto.nombre,
        esperado: d.stockEsperado,
        contado: d.stockContado,
        diferencia: d.diferencia,
        motivo: d.motivo,
      })),
    });
    return completo;
  }

  async listarConteos() {
    const conteos = await this.prisma.conteoInventario.findMany({
      include: { detalles: { select: { diferencia: true, stockContado: true, producto: { select: { precioVenta: true } } } } },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
    const usuarios = await this.nombresUsuarios(conteos.map((c) => c.usuarioId));
    return conteos.map((c) => ({
      id: c.id,
      fecha: c.fecha,
      observacion: c.observacion,
      usuario: c.usuarioId ? (usuarios.get(c.usuarioId) ?? null) : null,
      productos: c.detalles.length,
      conDiferencia: c.detalles.filter((d) => !new Prisma.Decimal(d.diferencia).isZero()).length,
      valorDiferencia: Math.round(
        c.detalles.reduce((t, d) => t + Number(d.diferencia) * Number(d.producto.precioVenta), 0),
      ),
    }));
  }

  /** Reporte de diferencias de un conteo */
  async obtenerConteo(id: number) {
    const c = await this.prisma.conteoInventario.findUnique({
      where: { id },
      include: {
        detalles: {
          include: {
            producto: { select: { id: true, plu: true, nombre: true, categoria: true, unidad: true, precioVenta: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!c) throw new NotFoundException('Conteo no encontrado');
    const usuarios = await this.nombresUsuarios([c.usuarioId]);

    const detalles = c.detalles.map((d) => {
      const diferencia = Number(d.diferencia);
      const precio = Number(d.producto.precioVenta);
      return {
        id: d.id,
        producto: { ...d.producto, precioVenta: precio },
        stockEsperado: Number(d.stockEsperado),
        stockContado: Number(d.stockContado),
        diferencia,
        /** Valor estimado de la diferencia a precio de venta */
        valorDiferencia: Math.round(diferencia * precio),
        motivo: d.motivo,
      };
    });
    const faltantes = detalles.filter((d) => d.diferencia < 0);
    const sobrantes = detalles.filter((d) => d.diferencia > 0);

    return {
      id: c.id,
      fecha: c.fecha,
      observacion: c.observacion,
      usuario: c.usuarioId ? (usuarios.get(c.usuarioId) ?? null) : null,
      detalles,
      resumen: {
        productos: detalles.length,
        conDiferencia: faltantes.length + sobrantes.length,
        faltantes: faltantes.length,
        sobrantes: sobrantes.length,
        valorFaltante: faltantes.reduce((t, d) => t + d.valorDiferencia, 0),
        valorSobrante: sobrantes.reduce((t, d) => t + d.valorDiferencia, 0),
      },
    };
  }

  private async nombresUsuarios(ids: (number | null)[]) {
    const unicos = [...new Set(ids.filter((x): x is number => x !== null))];
    const usuarios = await this.prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, username: true } });
    return new Map(usuarios.map((u) => [u.id, u.username]));
  }
}
