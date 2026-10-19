import { BadRequestException, Body, Controller, Get, Param, ParseBoolPipe, ParseEnumPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CategoriaProducto } from '@prisma/client';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { CrearConteoDto } from './dto/conteo.dto';
import { InventarioService } from './inventario.service';

@Roles('MESON')
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  /** GET /api/inventario/stock?categoria=CECINAS&texto=jamon&soloAlertas=true */
  @Get('stock')
  stock(
    @Query('categoria', new ParseEnumPipe(CategoriaProducto, { optional: true })) categoria?: CategoriaProducto,
    @Query('texto') texto?: string,
    @Query('soloAlertas', new ParseBoolPipe({ optional: true })) soloAlertas?: boolean,
  ) {
    return this.inventario.stock({ categoria, texto: texto?.slice(0, 60), soloAlertas });
  }

  /** GET /api/inventario/kardex/5?desde=2026-10-01&hasta=2026-10-31 */
  @Get('kardex/:productoId')
  kardex(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if ((desde && !esFechaISO(desde)) || (hasta && !esFechaISO(hasta))) {
      throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    }
    return this.inventario.kardex(productoId, desde || undefined, hasta || undefined);
  }

  @Get('conteos')
  listarConteos() {
    return this.inventario.listarConteos();
  }

  @Get('conteos/:id')
  obtenerConteo(@Param('id', ParseIntPipe) id: number) {
    return this.inventario.obtenerConteo(id);
  }

  /** Registra un conteo físico y ajusta el stock de los productos con diferencia */
  @Post('conteos')
  crearConteo(@Body() dto: CrearConteoDto, @CurrentUser() user: JwtPayload) {
    return this.inventario.crearConteo(dto, user.sub);
  }
}
