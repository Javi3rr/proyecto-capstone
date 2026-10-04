import { Body, Controller, Delete, Get, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ActualizarRepartidorDto, CrearRepartidorDto } from './dto/repartidor.dto';
import { RepartidoresService } from './repartidores.service';

@Roles('DESPACHO')
@Controller('repartidores')
export class RepartidoresController {
  constructor(private readonly repartidores: RepartidoresService) {}

  /** GET /api/repartidores?incluirInactivos=true */
  @Get()
  listar(@Query('incluirInactivos', new ParseBoolPipe({ optional: true })) incluirInactivos?: boolean) {
    return this.repartidores.listar(incluirInactivos ?? false);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.repartidores.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearRepartidorDto, @CurrentUser() user: JwtPayload) {
    return this.repartidores.crear(dto, user.sub);
  }

  /** También permite reactivar: { "activo": true } */
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarRepartidorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.repartidores.actualizar(id, dto, user.sub);
  }

  /** Eliminación lógica (desactivar) */
  @Delete(':id')
  desactivar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.repartidores.desactivar(id, user.sub);
  }
}
