import { Body, Controller, Delete, Get, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ActualizarProveedorDto, CrearProveedorDto } from './dto/proveedor.dto';
import { ProveedoresService } from './proveedores.service';

@Roles('MESON')
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  /** GET /api/proveedores?incluirInactivos=true */
  @Get()
  listar(@Query('incluirInactivos', new ParseBoolPipe({ optional: true })) incluirInactivos?: boolean) {
    return this.proveedores.listar(incluirInactivos ?? false);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.proveedores.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearProveedorDto, @CurrentUser() user: JwtPayload) {
    return this.proveedores.crear(dto, user.sub);
  }

  /** También permite reactivar: { "activo": true } */
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarProveedorDto, @CurrentUser() user: JwtPayload) {
    return this.proveedores.actualizar(id, dto, user.sub);
  }

  /** Eliminación lógica (desactivar) */
  @Delete(':id')
  desactivar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.proveedores.desactivar(id, user.sub);
  }
}
