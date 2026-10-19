import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriaProducto, Prisma, UnidadMedida } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { esErrorUnico, normalizarBarras, normalizarTexto } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { ImportarBarrasDto, ImportarProductosDto } from './dto/importar-productos.dto';
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
          ? [
              { nombre: { contains: texto, mode: 'insensitive' } },
              { plu: { startsWith: texto.toUpperCase() } },
              ...(normalizarBarras(texto) ? [{ codigoBarras: normalizarBarras(texto) }] : []),
            ]
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
          codigoBarras: normalizarBarras(dto.codigoBarras),
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
          codigoBarras: dto.codigoBarras === undefined ? undefined : normalizarBarras(dto.codigoBarras),
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

  /**
   * Importa el catálogo desde el Excel de las balanzas (columnas ya asignadas en pantalla).
   * Busca por PLU: si no existe lo crea; si existe y cambió nombre, precio, unidad o categoría, lo actualiza.
   * Nunca toca el stock. Con simular = true solo informa lo que haría.
   */
  async importar(dto: ImportarProductosDto, usuarioId?: number) {
    const errores: { fila: number; mensaje: string }[] = [];
    const validas: { fila: number; plu: string; nombre: string; precio: Prisma.Decimal; unidad: UnidadMedida; categoria: CategoriaProducto }[] = [];
    const vistos = new Set<string>();
    const omitidos: { fila: number; plu: string; motivo: string }[] = [];

    for (const f of dto.filas) {
      const plu = String(f.plu ?? '').trim().toUpperCase();
      const nombre = String(f.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!plu && !nombre) continue; // fila vacía
      // Posiciones de PLU sin usar en la balanza (sin nombre y sin precio)
      if (plu && !nombre && !f.precioVenta) {
        omitidos.push({ fila: f.fila, plu, motivo: 'PLU sin usar en la balanza' });
        continue;
      }
      // "PRODUCTO VARIO" es la tecla de precio libre: sus ventas se tratan como "Misc."
      if (normalizarTexto(nombre) === 'PRODUCTO VARIO') {
        omitidos.push({ fila: f.fila, plu, motivo: 'Tecla de precio libre: sus ventas se cuentan como "Misc."' });
        continue;
      }
      if (!plu) { errores.push({ fila: f.fila, mensaje: 'Sin código PLU' }); continue; }
      if (!/^[0-9A-Z-]{1,20}$/.test(plu)) { errores.push({ fila: f.fila, mensaje: `PLU inválido "${plu}"` }); continue; }
      if (!nombre) { errores.push({ fila: f.fila, mensaje: `PLU ${plu}: sin nombre` }); continue; }
      if (f.precioVenta === null || f.precioVenta === undefined || !Number.isFinite(f.precioVenta) || f.precioVenta < 0) {
        errores.push({ fila: f.fila, mensaje: `PLU ${plu}: precio inválido` });
        continue;
      }
      if (vistos.has(plu)) { errores.push({ fila: f.fila, mensaje: `PLU ${plu} repetido en el archivo` }); continue; }
      vistos.add(plu);
      const unidad = this.interpretarUnidad(f.unidad) ?? dto.unidadPorDefecto;
      validas.push({
        fila: f.fila,
        plu,
        nombre,
        precio: new Prisma.Decimal(Math.round(f.precioVenta)),
        unidad,
        categoria:
          this.interpretarCategoria(f.categoria) ??
          (dto.categoriaAutomatica ? this.categoriaPorNombre(nombre, unidad) : null) ??
          dto.categoriaPorDefecto,
      });
    }

    // Avisos que no impiden importar
    const advertencias: string[] = [];
    const sinPrecio = validas.filter((v) => v.precio.isZero()).map((v) => v.plu);
    if (sinPrecio.length) advertencias.push(`${sinPrecio.length} producto(s) con precio $0 (PLU ${sinPrecio.slice(0, 15).join(', ')}${sinPrecio.length > 15 ? '…' : ''}).`);
    const porNombre = new Map<string, string[]>();
    for (const v of validas) porNombre.set(normalizarTexto(v.nombre), [...(porNombre.get(normalizarTexto(v.nombre)) ?? []), v.plu]);
    const repetidos = [...porNombre.entries()].filter(([, plus]) => plus.length > 1);
    if (repetidos.length) {
      advertencias.push(
        `Nombres repetidos con distinto PLU: ${repetidos.map(([n, plus]) => `${n} (${plus.join(', ')})`).join('; ')}. ` +
          'Para cruzar ventas de estos productos se usará el PLU, no el nombre.',
      );
    }

    const existentes = await this.prisma.producto.findMany({ where: { plu: { in: validas.map((v) => v.plu) } } });
    const porPlu = new Map(existentes.map((p) => [p.plu, p]));

    const nuevos: typeof validas = [];
    const cambios: { id: number; plu: string; nombre: string; cambios: string[]; datos: Prisma.ProductoUpdateInput }[] = [];
    let sinCambios = 0;
    for (const v of validas) {
      const p = porPlu.get(v.plu);
      if (!p) { nuevos.push(v); continue; }
      const c: string[] = [];
      const datos: Prisma.ProductoUpdateInput = {};
      if (p.nombre !== v.nombre) { c.push(`nombre: "${p.nombre}" → "${v.nombre}"`); datos.nombre = v.nombre; }
      if (!new Prisma.Decimal(p.precioVenta).equals(v.precio)) { c.push(`precio: ${Number(p.precioVenta)} → ${Number(v.precio)}`); datos.precioVenta = v.precio; }
      if (p.unidad !== v.unidad) { c.push(`unidad: ${p.unidad} → ${v.unidad}`); datos.unidad = v.unidad; }
      if (p.categoria !== v.categoria) { c.push(`categoría: ${p.categoria} → ${v.categoria}`); datos.categoria = v.categoria; }
      if (!p.activo) { c.push('se reactiva'); datos.activo = true; }
      if (c.length) cambios.push({ id: p.id, plu: v.plu, nombre: v.nombre, cambios: c, datos });
      else sinCambios++;
    }

    const resumen = {
      filasLeidas: dto.filas.length,
      nuevos: nuevos.map((n) => ({ fila: n.fila, plu: n.plu, nombre: n.nombre, precio: Number(n.precio), unidad: n.unidad, categoria: n.categoria })),
      actualizados: cambios.map((c) => ({ plu: c.plu, nombre: c.nombre, cambios: c.cambios })),
      sinCambios,
      errores,
      omitidos,
      advertencias,
      guardado: false,
    };
    if (dto.simular || (nuevos.length === 0 && cambios.length === 0)) return resumen;

    await this.prisma.$transaction(
      async (tx) => {
        if (nuevos.length) {
          await tx.producto.createMany({
            data: nuevos.map((n) => ({ plu: n.plu, nombre: n.nombre, precioVenta: n.precio, unidad: n.unidad, categoria: n.categoria })),
          });
        }
        for (const c of cambios) await tx.producto.update({ where: { id: c.id }, data: c.datos });
      },
      { timeout: 60_000 },
    );
    await this.audit.registrar({
      usuarioId,
      accion: 'IMPORTAR_PRODUCTOS',
      recurso: 'producto/importacion',
      detalle: {
        archivo: dto.nombreArchivo ?? null,
        nuevos: resumen.nuevos.map((n) => n.plu),
        actualizados: resumen.actualizados,
        errores: errores.length,
      },
    });
    return { ...resumen, guardado: true };
  }

  private interpretarUnidad(texto?: string | null): UnidadMedida | null {
    const t = normalizarTexto(texto ?? '');
    if (!t) return null;
    // Balanzas CAS, columna "Tipo de PLU": 1 = por peso, 2 = por unidad, 3 = por conteo
    if (t === '1') return 'KG';
    if (t === '2' || t === '3') return 'UNIDAD';
    if (/^(KG|KILO|KILOS|KGS|PESO|P|W|GRANEL|PESABLE)$/.test(t) || t.includes('PESO') || t.includes('KILO')) return 'KG';
    if (/^(U|UN|UND|UNID|UNIDAD|UNIDADES|PZA|PIEZA|PZ|C|CONTEO|CANT|CANTIDAD|N)$/.test(t) || t.includes('UNID') || t.includes('CONTEO')) return 'UNIDAD';
    return null;
  }

  private interpretarCategoria(texto?: string | null): CategoriaProducto | null {
    const t = normalizarTexto(texto ?? '');
    if (!t) return null;
    if (t.startsWith('PAN') || t.includes('PANADERIA') || t.includes('PASTEL') || t.includes('BOLLERIA')) return 'PAN';
    if (t.includes('CECINA') || t.includes('FIAMBRE') || t.includes('JAMON') || t.includes('QUESO') || t.includes('EMBUTIDO')) return 'CECINAS';
    if (t.includes('MERCADER') || t.includes('ABARROTE') || t.includes('ALMACEN') || t.includes('BEBIDA')) return 'MERCADERIA';
    return null;
  }

  /**
   * Categoría deducida cuando el archivo no la trae (el PLUData de CAS no la usa):
   *  - productos de panadería por su nombre -> PAN
   *  - el resto que se vende al peso (jamones, quesos, fiambres) -> CECINAS
   *  - el resto por unidad -> MERCADERIA
   */
  private categoriaPorNombre(nombre: string, unidad: UnidadMedida): CategoriaProducto {
    const n = normalizarTexto(nombre);
    const panaderia =
      /^(PAN|EMPANADA|BERLIN|DONAS?|TRENZA|QUEQUE|BRAZO DE REINA|ROLES? DE CANELA|MENDOCINO|DULCE CASERO|KUCHEN|PASTEL|TORTA|MEDIALUNA|CHILENITA|MARRAQUETA|HALLULLA|COLIZA|DOBLADITA|SOPAIPILLA|CACHITO|PALMERA)\b/;
    if (panaderia.test(n) && !/^PAN (IDEAL|PITA|BIMBO|CASTANO|FUCHS|RALLADO)/.test(n)) return 'PAN';
    if (unidad === 'KG') return 'CECINAS';
    return 'MERCADERIA';
  }

  /**
   * Asigna códigos de barras desde el ScannerMap de la balanza (PLU -> código de mapeo).
   * Si el código es igual al PLU, el producto no tiene código de barras propio y se omite.
   */
  async importarBarras(dto: ImportarBarrasDto, usuarioId?: number) {
    const errores: { fila: number; mensaje: string }[] = [];
    const filas: { fila: number; plu: string; codigo: string }[] = [];
    let sinCodigo = 0;
    for (const f of dto.filas) {
      const plu = String(f.plu ?? '').trim().toUpperCase();
      const crudo = String(f.codigo ?? '').trim();
      if (!plu && !crudo) continue;
      if (!plu) { errores.push({ fila: f.fila, mensaje: 'Sin PLU' }); continue; }
      if (!crudo || crudo.replace(/^0+/, '') === plu.replace(/^0+/, '')) { sinCodigo++; continue; }
      const codigo = normalizarBarras(crudo);
      if (!codigo) { errores.push({ fila: f.fila, mensaje: `PLU ${plu}: código "${crudo}" inválido` }); continue; }
      filas.push({ fila: f.fila, plu, codigo });
    }

    const productos = await this.prisma.producto.findMany({
      where: { plu: { in: filas.map((f) => f.plu) } },
      select: { id: true, plu: true, nombre: true, codigoBarras: true },
    });
    const porPlu = new Map(productos.map((p) => [p.plu, p]));
    const cambios: { id: number; plu: string; nombre: string; antes: string | null; despues: string }[] = [];
    const noEncontrados: string[] = [];
    let sinCambios = 0;
    for (const f of filas) {
      const p = porPlu.get(f.plu);
      if (!p) { noEncontrados.push(f.plu); continue; }
      if (p.codigoBarras === f.codigo) { sinCambios++; continue; }
      cambios.push({ id: p.id, plu: p.plu, nombre: p.nombre, antes: p.codigoBarras, despues: f.codigo });
    }
    const conteo = new Map<string, number>();
    for (const f of filas) conteo.set(f.codigo, (conteo.get(f.codigo) ?? 0) + 1);
    const compartidos = [...conteo.entries()].filter(([, n]) => n > 1).map(([c]) => c);

    const resumen = {
      asignados: cambios.map(({ plu, nombre, antes, despues }) => ({ plu, nombre, antes, despues })),
      sinCambios,
      sinCodigo,
      noEncontrados,
      compartidos,
      errores,
      guardado: false,
    };
    if (dto.simular || cambios.length === 0) return resumen;

    await this.prisma.$transaction(
      cambios.map((c) => this.prisma.producto.update({ where: { id: c.id }, data: { codigoBarras: c.despues } })),
    );
    await this.audit.registrar({
      usuarioId,
      accion: 'IMPORTAR_BARRAS',
      recurso: 'producto/codigos-barras',
      detalle: { archivo: dto.nombreArchivo ?? null, asignados: cambios.length, noEncontrados: noEncontrados.length },
    });
    return { ...resumen, guardado: true };
  }
}
