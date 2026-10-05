import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoLineaVenta } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, fechaDesdeISO, hoySantiago, normalizarTexto } from '../common/utils';
import { registrarMovimiento } from '../inventario/movimientos';
import { PrismaService } from '../prisma/prisma.service';
import { CierreManualDto, ImportarVentasDto, LineaArchivoDto } from './dto/ventas.dto';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const DESCRIPCION_MISC = 'Misc. Por Conteo';

/** Filas que las exportaciones suelen traer al final y no son ventas */
const FILAS_DE_TOTAL = /^(SUB ?TOTAL|TOTAL|TOTALES|RESUMEN)\b/;

/** Venta ya interpretada y agrupada por día, mesonera y producto */
interface LineaAgrupada {
  fecha: string;
  codigoMesonera: string | null;
  tipo: TipoLineaVenta;
  productoId: number | null;
  plu: string | null;
  descripcion: string;
  cantidad: number;
  monto: number;
}

interface ProductoCatalogo {
  id: number;
  plu: string;
  nombre: string;
  precioVenta: Prisma.Decimal;
}

/**
 * Convierte la fecha del archivo a AAAA-MM-DD.
 * Acepta 2026-10-05, 05-10-2026, 05/10/2026, 05-10-26 (día primero, como en Chile), con o sin hora.
 */
export function interpretarFecha(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = String(texto).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  let a: number, mes: number, d: number;
  if (m) {
    [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
    if (!m) return null;
    [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (a < 100) a += 2000;
  }
  const fecha = new Date(Date.UTC(a, mes - 1, d));
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== d) return null;
  return iso(fecha);
}

/** "CLERK(1)", "V1", "01", "1" -> "1"; otros textos se dejan en mayúsculas */
export function normalizarMesonera(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const n = /(\d+)/.exec(t);
  return n ? String(Number(n[1])) : normalizarTexto(t).slice(0, 20);
}

/**
 * Ventas de las balanzas.
 *  - Importación desde archivo (columnas asignadas en pantalla) o cierre manual del día.
 *  - Cada venta de un producto del catálogo descuenta stock (SALIDA_VENTA, con el código de mesonera).
 *  - "Misc. Por Conteo" y ventas que no calzan con el catálogo se registran, pero no mueven stock.
 *  - No se aceptan dos cargas vigentes para el mismo día; se anula una para volver a cargar.
 */
@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- Importar archivo

  async importarArchivo(dto: ImportarVentasDto, usuarioId?: number) {
    const productos = await this.catalogo();
    const { lineas, errores, omitidas } = this.interpretar(dto.lineas, dto.fechaPorDefecto, productos);
    if (lineas.length === 0) {
      throw new BadRequestException(
        errores.length ? `Ninguna fila es válida. Primer error: fila ${errores[0].fila}: ${errores[0].mensaje}` : 'El archivo no tiene ventas',
      );
    }
    const analisis = this.analizar(lineas);
    const hash = createHash('sha256').update(JSON.stringify(lineas)).digest('hex');
    const resultado = { ...analisis, errores, omitidas, guardado: false as boolean, importacionId: null as number | null };

    const conflicto = await this.cargaSuperpuesta(analisis.periodo.desde, analisis.periodo.hasta);
    const duplicado = await this.prisma.importacionBalanza.findUnique({ where: { hashArchivo: hash }, select: { id: true } });
    const advertencias = [
      ...(conflicto ? [`Ya hay ventas cargadas (carga N° ${conflicto.id}) entre el ${conflicto.desde} y el ${conflicto.hasta}. Anúlela antes de importar este período.`] : []),
      ...(duplicado ? [`Este mismo contenido ya fue importado (carga N° ${duplicado.id}).`] : []),
    ];
    if (dto.simular) return { ...resultado, advertencias };
    if (advertencias.length) throw new ConflictException(advertencias.join(' '));

    const id = await this.guardar(
      {
        origen: 'ARCHIVO',
        nombreArchivo: dto.nombreArchivo,
        hashArchivo: hash,
        observacion: null,
        filas: dto.lineas.length,
      },
      lineas,
      analisis.mesoneras.map((m) => ({ ...m, tickets: null })),
      usuarioId,
    );
    return { ...resultado, advertencias, guardado: true, importacionId: id };
  }

  // ---------------------------------------------------------------- Cierre manual

  async cierreManual(dto: CierreManualDto, usuarioId?: number) {
    if (dto.fecha > hoySantiago()) throw new BadRequestException('No se pueden registrar ventas de días futuros');
    const misc = dto.mesoneras.length
      ? dto.mesoneras.reduce((t, m) => t + m.montoMisc, 0)
      : (dto.montoMisc ?? 0);
    if (dto.lineas.length === 0 && misc === 0) throw new BadRequestException('Ingrese al menos un producto vendido o el total "Misc."');

    const codigos = dto.mesoneras.map((m) => normalizarMesonera(m.codigo)!);
    if (new Set(codigos).size !== codigos.length) throw new BadRequestException('Hay mesoneras repetidas');

    const ids = [...new Set(dto.lineas.map((l) => l.productoId))];
    const productos = await this.prisma.producto.findMany({ where: { id: { in: ids } }, select: { id: true, plu: true, nombre: true } });
    if (productos.length !== ids.length) throw new BadRequestException('Uno o más productos no existen');
    const porId = new Map(productos.map((p) => [p.id, p]));

    // Agrupa por producto (por si se ingresó dos veces el mismo)
    const acumulado = new Map<number, LineaAgrupada>();
    for (const l of dto.lineas) {
      const p = porId.get(l.productoId)!;
      const a = acumulado.get(p.id) ?? {
        fecha: dto.fecha,
        codigoMesonera: null,
        tipo: 'PRODUCTO' as const,
        productoId: p.id,
        plu: p.plu,
        descripcion: p.nombre,
        cantidad: 0,
        monto: 0,
      };
      a.cantidad = r3(a.cantidad + l.cantidad);
      a.monto += l.monto;
      acumulado.set(p.id, a);
    }
    const lineas = [...acumulado.values()];
    if (misc > 0) {
      lineas.push({ fecha: dto.fecha, codigoMesonera: null, tipo: 'MISC', productoId: null, plu: null, descripcion: DESCRIPCION_MISC, cantidad: 1, monto: misc });
    }

    const conflicto = await this.cargaSuperpuesta(dto.fecha, dto.fecha);
    if (conflicto) {
      throw new ConflictException(`Ya hay ventas cargadas para ese día (carga N° ${conflicto.id}). Anúlela para volver a ingresarlas.`);
    }

    const totalProductos = lineas.reduce((t, l) => t + l.monto, 0);
    const totalMesoneras = dto.mesoneras.reduce((t, m) => t + m.monto, 0);
    const id = await this.guardar(
      { origen: 'MANUAL', nombreArchivo: null, hashArchivo: null, observacion: dto.observacion ?? null, filas: lineas.length },
      lineas,
      dto.mesoneras.map((m, i) => ({
        fecha: dto.fecha,
        codigoMesonera: codigos[i],
        monto: m.monto,
        montoMisc: m.montoMisc,
        lineasMisc: m.montoMisc > 0 ? 1 : 0,
        tickets: m.tickets ?? null,
      })),
      usuarioId,
    );
    return {
      importacionId: id,
      totalProductos,
      totalMesoneras,
      // Si se ingresó por mesonera, ambos totales deberían coincidir con el reporte de la balanza
      diferencia: dto.mesoneras.length ? totalMesoneras - totalProductos : 0,
    };
  }

  // ---------------------------------------------------------------- Consultas

  async listar() {
    const cargas = await this.prisma.importacionBalanza.findMany({
      orderBy: [{ periodoHasta: 'desc' }, { id: 'desc' }],
      take: 300,
      include: { _count: { select: { lineas: true } } },
    });
    const usuarios = await this.nombresUsuarios(cargas.map((c) => c.usuarioId));
    return cargas.map((c) => ({
      id: c.id,
      origen: c.origen,
      nombreArchivo: c.nombreArchivo,
      desde: iso(c.periodoDesde),
      hasta: iso(c.periodoHasta),
      lineas: c._count.lineas,
      totalMonto: Number(c.totalMonto),
      estado: c.estado,
      motivoAnulacion: c.motivoAnulacion,
      usuario: c.usuarioId ? (usuarios.get(c.usuarioId) ?? null) : null,
      creadoEn: c.creadoEn,
    }));
  }

  async obtener(id: number) {
    const c = await this.prisma.importacionBalanza.findUnique({
      where: { id },
      include: {
        lineas: { include: { producto: { select: { id: true, plu: true, nombre: true, unidad: true } } }, orderBy: [{ fecha: 'asc' }, { tipo: 'asc' }, { descripcion: 'asc' }] },
        resumenes: { orderBy: [{ fecha: 'asc' }, { codigoMesonera: 'asc' }] },
      },
    });
    if (!c) throw new NotFoundException('Carga de ventas no encontrada');
    const usuarios = await this.nombresUsuarios([c.usuarioId, c.anuladaPorId]);
    const mesoneras = await this.mesonerasPorCodigo();
    return {
      id: c.id,
      origen: c.origen,
      nombreArchivo: c.nombreArchivo,
      desde: iso(c.periodoDesde),
      hasta: iso(c.periodoHasta),
      totalMonto: Number(c.totalMonto),
      observacion: c.observacion,
      estado: c.estado,
      motivoAnulacion: c.motivoAnulacion,
      anuladaEn: c.anuladaEn,
      anuladaPor: c.anuladaPorId ? (usuarios.get(c.anuladaPorId) ?? null) : null,
      usuario: c.usuarioId ? (usuarios.get(c.usuarioId) ?? null) : null,
      creadoEn: c.creadoEn,
      lineas: c.lineas.map((l) => ({
        id: l.id,
        fecha: iso(l.fecha),
        codigoMesonera: l.codigoMesonera,
        tipo: l.tipo,
        producto: l.producto,
        plu: l.plu,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        monto: Number(l.monto),
      })),
      resumenes: c.resumenes.map((r) => ({
        fecha: iso(r.fecha),
        codigoMesonera: r.codigoMesonera,
        mesonera: mesoneras.get(r.codigoMesonera) ?? null,
        monto: Number(r.monto),
        montoMisc: Number(r.montoMisc),
        lineasMisc: r.lineasMisc,
        tickets: r.tickets,
      })),
    };
  }

  /** Anula una carga: devuelve al stock lo que había descontado (sin borrar el historial) */
  async anular(id: number, motivo: string, usuarioId?: number) {
    const c = await this.prisma.importacionBalanza.findUnique({
      where: { id },
      include: { lineas: { where: { tipo: 'PRODUCTO', productoId: { not: null } } } },
    });
    if (!c) throw new NotFoundException('Carga de ventas no encontrada');
    if (c.estado === 'ANULADA') throw new ConflictException('La carga ya está anulada');

    await this.prisma.$transaction(
      async (tx) => {
        const r = await tx.importacionBalanza.updateMany({
          where: { id, estado: 'VIGENTE' },
          data: { estado: 'ANULADA', motivoAnulacion: motivo, anuladaPorId: usuarioId ?? null, anuladaEn: new Date() },
        });
        if (r.count === 0) throw new ConflictException('La carga ya está anulada');
        for (const l of c.lineas) {
          await registrarMovimiento(tx, {
            productoId: l.productoId!,
            tipo: 'ANULACION_VENTA',
            cantidad: new Prisma.Decimal(l.cantidad),
            origenTipo: 'IMPORTACION_BALANZA',
            origenId: id,
            codigoMesonera: l.codigoMesonera,
            motivo: `Anulación carga de ventas N° ${id}: ${motivo}`,
            usuarioId,
          });
        }
      },
      { timeout: 120_000 },
    );
    await this.audit.registrar({ usuarioId, accion: 'ANULAR', recurso: `ventas/${id}`, detalle: { motivo, lineasRevertidas: c.lineas.length } });
    return this.obtener(id);
  }

  /** Reporte por mesonera: ventas, "Misc." y su porcentaje; además lo más vendido del período */
  async reporte(desde: string, hasta: string) {
    if (desde > hasta) throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta"');
    const rango = { gte: fechaDesdeISO(desde), lte: fechaDesdeISO(hasta) };
    const vigente = { estado: 'VIGENTE' as const };

    const [resumenes, porProducto, porTipo, mesoneras] = await Promise.all([
      this.prisma.resumenMesonera.findMany({ where: { fecha: rango, importacion: vigente } }),
      this.prisma.ventaBalanza.groupBy({
        by: ['productoId'],
        where: { fecha: rango, tipo: 'PRODUCTO', importacion: vigente },
        _sum: { cantidad: true, monto: true },
      }),
      this.prisma.ventaBalanza.groupBy({
        by: ['tipo'],
        where: { fecha: rango, importacion: vigente },
        _sum: { monto: true },
        _count: { _all: true },
      }),
      this.mesonerasPorCodigo(),
    ]);

    const acum = new Map<string, { dias: Set<string>; monto: number; montoMisc: number; lineasMisc: number; tickets: number | null }>();
    for (const r of resumenes) {
      const a = acum.get(r.codigoMesonera) ?? { dias: new Set<string>(), monto: 0, montoMisc: 0, lineasMisc: 0, tickets: null };
      a.dias.add(iso(r.fecha));
      a.monto += Number(r.monto);
      a.montoMisc += Number(r.montoMisc);
      a.lineasMisc += r.lineasMisc;
      if (r.tickets !== null) a.tickets = (a.tickets ?? 0) + r.tickets;
      acum.set(r.codigoMesonera, a);
    }
    const filasMesoneras = [...acum.entries()]
      .map(([codigo, a]) => ({
        codigo,
        mesonera: mesoneras.get(codigo) ?? null,
        dias: a.dias.size,
        monto: Math.round(a.monto),
        montoMisc: Math.round(a.montoMisc),
        lineasMisc: a.lineasMisc,
        tickets: a.tickets,
        porcentajeMisc: a.monto > 0 ? Math.round((a.montoMisc / a.monto) * 1000) / 10 : 0,
      }))
      .sort((x, y) => y.porcentajeMisc - x.porcentajeMisc);

    const productos = await this.prisma.producto.findMany({
      where: { id: { in: porProducto.map((p) => p.productoId).filter((x): x is number => x !== null) } },
      select: { id: true, plu: true, nombre: true, unidad: true },
    });
    const prod = new Map(productos.map((p) => [p.id, p]));
    const masVendidos = porProducto
      .map((p) => ({ producto: prod.get(p.productoId!) ?? null, cantidad: r3(Number(p._sum.cantidad ?? 0)), monto: Math.round(Number(p._sum.monto ?? 0)) }))
      .filter((p) => p.producto)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 30);

    const total = (t: TipoLineaVenta) => Math.round(Number(porTipo.find((x) => x.tipo === t)?._sum.monto ?? 0));
    const totalVentas = total('PRODUCTO') + total('MISC') + total('SIN_PRODUCTO');
    return {
      desde,
      hasta,
      totales: {
        ventas: totalVentas,
        productos: total('PRODUCTO'),
        misc: total('MISC'),
        sinProducto: total('SIN_PRODUCTO'),
        porcentajeMisc: totalVentas > 0 ? Math.round((total('MISC') / totalVentas) * 1000) / 10 : 0,
      },
      mesoneras: filasMesoneras,
      masVendidos,
    };
  }

  /** Usuarios con código de mesonera (para los formularios y reportes) */
  async mesoneras() {
    return this.prisma.usuario.findMany({
      where: { codigo: { not: null } },
      select: { codigo: true, nombre: true, username: true, activo: true },
      orderBy: { codigo: 'asc' },
    });
  }

  // ---------------------------------------------------------------- Internos

  private async catalogo(): Promise<ProductoCatalogo[]> {
    return this.prisma.producto.findMany({ select: { id: true, plu: true, nombre: true, precioVenta: true } });
  }

  /** Valida cada fila, la clasifica (producto / misc / sin producto) y agrupa por día, mesonera y producto */
  private interpretar(filas: LineaArchivoDto[], fechaPorDefecto: string | undefined, productos: ProductoCatalogo[]) {
    const porPlu = new Map(productos.map((p) => [p.plu.toUpperCase(), p]));
    const porNombre = new Map(productos.map((p) => [normalizarTexto(p.nombre), p]));
    const errores: { fila: number; mensaje: string }[] = [];
    let omitidas = 0;
    const grupos = new Map<string, LineaAgrupada>();
    const hoy = hoySantiago();

    for (const f of filas) {
      const plu = String(f.plu ?? '').trim().toUpperCase() || null;
      const descripcion = String(f.descripcion ?? '').replace(/\s+/g, ' ').trim();
      const desc = normalizarTexto(descripcion);
      if (!plu && !desc && (f.monto === null || f.monto === undefined)) {
        omitidas++;
        continue;
      }
      if (!plu && FILAS_DE_TOTAL.test(desc)) {
        omitidas++;
        continue;
      }

      const fecha = interpretarFecha(f.fecha) ?? (f.fecha ? null : (fechaPorDefecto ?? null));
      if (!fecha) {
        errores.push({ fila: f.fila, mensaje: f.fecha ? `Fecha no reconocida "${f.fecha}"` : 'Sin fecha (elija una fecha para el archivo)' });
        continue;
      }
      if (fecha > hoy) {
        errores.push({ fila: f.fila, mensaje: `Fecha futura ${fecha}` });
        continue;
      }

      let tipo: TipoLineaVenta;
      let producto: ProductoCatalogo | undefined;
      if (desc.startsWith('MISC')) {
        tipo = 'MISC';
      } else {
        producto = (plu ? porPlu.get(plu) : undefined) ?? (desc ? porNombre.get(desc) : undefined);
        tipo = producto ? 'PRODUCTO' : 'SIN_PRODUCTO';
      }

      const cantidad = f.cantidad === null || f.cantidad === undefined ? 1 : Number(f.cantidad);
      if (!Number.isFinite(cantidad) || cantidad < 0) {
        errores.push({ fila: f.fila, mensaje: 'Cantidad inválida' });
        continue;
      }
      let monto = f.monto === null || f.monto === undefined ? null : Number(f.monto);
      if (monto === null && producto) monto = Math.round(cantidad * Number(producto.precioVenta));
      if (monto === null || !Number.isFinite(monto)) {
        errores.push({ fila: f.fila, mensaje: 'Sin monto' });
        continue;
      }
      if (cantidad === 0 && monto === 0) {
        omitidas++;
        continue;
      }

      const codigoMesonera = normalizarMesonera(f.mesonera);
      const nombre = tipo === 'MISC' ? DESCRIPCION_MISC : producto ? producto.nombre : (descripcion || `PLU ${plu}`).slice(0, 150);
      const clave = [fecha, codigoMesonera ?? '', tipo, producto?.id ?? '', tipo === 'SIN_PRODUCTO' ? (plu ?? desc) : ''].join('|');
      const g = grupos.get(clave) ?? {
        fecha,
        codigoMesonera,
        tipo,
        productoId: producto?.id ?? null,
        plu: producto?.plu ?? plu,
        descripcion: nombre,
        cantidad: 0,
        monto: 0,
      };
      g.cantidad = r3(g.cantidad + cantidad);
      g.monto = Math.round((g.monto + monto) * 100) / 100;
      grupos.set(clave, g);
    }

    const lineas = [...grupos.values()].sort(
      (a, b) => a.fecha.localeCompare(b.fecha) || (a.codigoMesonera ?? '').localeCompare(b.codigoMesonera ?? '') || a.descripcion.localeCompare(b.descripcion),
    );
    return { lineas, errores, omitidas };
  }

  /** Resumen para mostrar antes de confirmar */
  private analizar(lineas: LineaAgrupada[]) {
    const fechas = lineas.map((l) => l.fecha).sort();
    const suma = (t: TipoLineaVenta) => lineas.filter((l) => l.tipo === t);
    const total = (ls: LineaAgrupada[]) => Math.round(ls.reduce((s, l) => s + l.monto, 0));

    const mesoneras = new Map<string, { fecha: string; codigoMesonera: string; monto: number; montoMisc: number; lineasMisc: number }>();
    for (const l of lineas) {
      if (!l.codigoMesonera) continue;
      const k = `${l.fecha}|${l.codigoMesonera}`;
      const m = mesoneras.get(k) ?? { fecha: l.fecha, codigoMesonera: l.codigoMesonera, monto: 0, montoMisc: 0, lineasMisc: 0 };
      m.monto += l.monto;
      if (l.tipo === 'MISC') {
        m.montoMisc += l.monto;
        m.lineasMisc++;
      }
      mesoneras.set(k, m);
    }

    // Lo que no calzó con el catálogo, agrupado para que se pueda crear el producto antes de importar
    const sinProducto = new Map<string, { plu: string | null; descripcion: string; cantidad: number; monto: number }>();
    for (const l of suma('SIN_PRODUCTO')) {
      const k = `${l.plu ?? ''}|${l.descripcion}`;
      const s = sinProducto.get(k) ?? { plu: l.plu, descripcion: l.descripcion, cantidad: 0, monto: 0 };
      s.cantidad = r3(s.cantidad + l.cantidad);
      s.monto += l.monto;
      sinProducto.set(k, s);
    }

    return {
      periodo: { desde: fechas[0], hasta: fechas[fechas.length - 1], dias: new Set(fechas).size },
      lineasAgrupadas: lineas.length,
      totales: {
        ventas: total(lineas),
        productos: total(suma('PRODUCTO')),
        misc: total(suma('MISC')),
        sinProducto: total(suma('SIN_PRODUCTO')),
      },
      productosConStock: new Set(suma('PRODUCTO').map((l) => l.productoId)).size,
      sinProducto: [...sinProducto.values()].sort((a, b) => b.monto - a.monto),
      mesoneras: [...mesoneras.values()],
    };
  }

  private async guardar(
    cabecera: { origen: 'ARCHIVO' | 'MANUAL'; nombreArchivo: string | null; hashArchivo: string | null; observacion: string | null; filas: number },
    lineas: LineaAgrupada[],
    resumenes: { fecha: string; codigoMesonera: string; monto: number; montoMisc: number; lineasMisc: number; tickets: number | null }[],
    usuarioId?: number,
  ): Promise<number> {
    const fechas = lineas.map((l) => l.fecha).concat(resumenes.map((r) => r.fecha)).sort();
    const totalMonto = lineas.reduce((t, l) => t + l.monto, 0);
    try {
      const id = await this.prisma.$transaction(
        async (tx) => {
          const imp = await tx.importacionBalanza.create({
            data: {
              ...cabecera,
              periodoDesde: fechaDesdeISO(fechas[0]),
              periodoHasta: fechaDesdeISO(fechas[fechas.length - 1]),
              totalMonto: new Prisma.Decimal(Math.round(totalMonto * 100) / 100),
              usuarioId: usuarioId ?? null,
            },
          });
          await tx.ventaBalanza.createMany({
            data: lineas.map((l) => ({
              importacionId: imp.id,
              fecha: fechaDesdeISO(l.fecha),
              codigoMesonera: l.codigoMesonera,
              productoId: l.productoId,
              plu: l.plu?.slice(0, 20) ?? null,
              descripcion: l.descripcion.slice(0, 150),
              cantidad: new Prisma.Decimal(l.cantidad),
              monto: new Prisma.Decimal(l.monto),
              tipo: l.tipo,
            })),
          });
          if (resumenes.length) {
            await tx.resumenMesonera.createMany({
              data: resumenes.map((r) => ({
                importacionId: imp.id,
                fecha: fechaDesdeISO(r.fecha),
                codigoMesonera: r.codigoMesonera,
                monto: new Prisma.Decimal(Math.round(r.monto)),
                montoMisc: new Prisma.Decimal(Math.round(r.montoMisc)),
                lineasMisc: r.lineasMisc,
                tickets: r.tickets,
              })),
            });
          }
          // Descuenta del stock lo vendido de cada producto del catálogo
          for (const l of lineas) {
            if (l.tipo !== 'PRODUCTO' || !l.productoId || l.cantidad === 0) continue;
            await registrarMovimiento(tx, {
              productoId: l.productoId,
              tipo: 'SALIDA_VENTA',
              cantidad: new Prisma.Decimal(l.cantidad).neg(),
              origenTipo: 'IMPORTACION_BALANZA',
              origenId: imp.id,
              codigoMesonera: l.codigoMesonera,
              motivo: `Ventas balanza del ${l.fecha}${l.codigoMesonera ? ' · mesonera ' + l.codigoMesonera : ''}`,
              usuarioId,
            });
          }
          return imp.id;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      await this.audit.registrar({
        usuarioId,
        accion: cabecera.origen === 'ARCHIVO' ? 'IMPORTAR_VENTAS' : 'CIERRE_VENTAS',
        recurso: `ventas/${id}`,
        detalle: { archivo: cabecera.nombreArchivo, desde: fechas[0], hasta: fechas[fechas.length - 1], lineas: lineas.length, total: Math.round(totalMonto) },
      });
      return id;
    } catch (e) {
      if (esErrorUnico(e)) throw new ConflictException('Este mismo contenido ya fue importado');
      throw e;
    }
  }

  /** Carga vigente que ya cubre alguno de los días del período */
  private async cargaSuperpuesta(desde: string, hasta: string) {
    const c = await this.prisma.importacionBalanza.findFirst({
      where: { estado: 'VIGENTE', periodoDesde: { lte: fechaDesdeISO(hasta) }, periodoHasta: { gte: fechaDesdeISO(desde) } },
      select: { id: true, periodoDesde: true, periodoHasta: true },
    });
    return c ? { id: c.id, desde: iso(c.periodoDesde), hasta: iso(c.periodoHasta) } : null;
  }

  private async mesonerasPorCodigo() {
    const us = await this.prisma.usuario.findMany({ where: { codigo: { not: null } }, select: { codigo: true, nombre: true } });
    return new Map(us.map((u) => [normalizarMesonera(u.codigo) ?? u.codigo!, u.nombre]));
  }

  private async nombresUsuarios(ids: (number | null)[]) {
    const unicos = [...new Set(ids.filter((x): x is number => x !== null))];
    const us = await this.prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, username: true } });
    return new Map(us.map((u) => [u.id, u.username]));
  }
}
