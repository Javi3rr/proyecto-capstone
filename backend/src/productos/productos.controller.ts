import { Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CategoriaProducto } from '@prisma/client';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ImportarProductosDto } from './dto/importar-productos.dto';
import { ActualizarProductoDto, CrearProductoDto } from './dto/producto.dto';
import { ProductosService } from './productos.service';

@Roles('MESON')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  /** GET /api/productos?incluirInactivos=true&categoria=CECINAS&texto=jamon */
  @Get()
  listar(
    @Query('incluirInactivos', new ParseBoolPipe({ optional: true })) incluirInactivos?: boolean,
    @Query('categoria', new ParseEnumPipe(CategoriaProducto, { optional: true })) categoria?: CategoriaProducto,
    @Query('texto') texto?: string,
  ) {
    return this.productos.listar({ incluirInactivos, categoria, texto: texto?.slice(0, 60) });
  }

  /** POST /api/productos/importar  -> carga/actualiza el catálogo desde el Excel de las balanzas (simular = solo revisar) */
  @Post('importar')
  @HttpCode(200)
  importar(@Body() dto: ImportarProductosDto, @CurrentUser() user: JwtPayload) {
    return this.productos.importar(dto, user.sub);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.productos.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearProductoDto, @CurrentUser() user: JwtPayload) {
    return this.productos.crear(dto, user.sub);
  }

  /** También permite reactivar: { "activo": true } */
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProductoDto, @CurrentUser() user: JwtPayload) {
    return this.productos.actualizar(id, dto, user.sub);
  }

  /** Eliminación lógica (desactivar) */
  @Delete(':id')
  desactivar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.productos.desactivar(id, user.sub);
  }
}
