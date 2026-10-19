import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CrearPrecioKgDto } from './dto/precio-kg.dto';
import { PreciosService } from './precios.service';

@Roles('DESPACHO')
@Controller('precios-kg')
export class PreciosController {
  constructor(private readonly precios: PreciosService) {}

  @Get()
  historial() {
    return this.precios.historial();
  }

  /** GET /api/precios-kg/vigente?fecha=2026-10-04  (sin fecha = hoy) */
  @Get('vigente')
  async vigente(@Query('fecha') fecha?: string) {
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    }
    // null si aún no se ha definido ningún precio
    return (await this.precios.vigente(fecha)) ?? null;
  }

  @Post()
  crear(@Body() dto: CrearPrecioKgDto, @CurrentUser() user: JwtPayload) {
    return this.precios.crear(dto, user.sub);
  }
}
