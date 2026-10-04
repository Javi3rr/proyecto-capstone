import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseFechaPipe } from '../common/parse-fecha.pipe';
import { RegistrarLineaDto } from './dto/linea.dto';
import { PlanillaService } from './planilla.service';

@Roles('DESPACHO')
@Controller('planilla')
export class PlanillaController {
  constructor(private readonly planilla: PlanillaService) {}

  /** GET /api/planilla/2026-10-04 */
  @Get(':fecha')
  obtener(@Param('fecha', ParseFechaPipe) fecha: string) {
    return this.planilla.obtener(fecha);
  }

  /** PUT /api/planilla/2026-10-04/clientes/5  { "kg": 12 } */
  @Put(':fecha/clientes/:clienteId')
  registrar(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Body() dto: RegistrarLineaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.planilla.registrarLinea(fecha, clienteId, dto, { id: user.sub, rol: user.rol });
  }

  @Post(':fecha/cerrar')
  @HttpCode(200)
  cerrar(@Param('fecha', ParseFechaPipe) fecha: string, @CurrentUser() user: JwtPayload) {
    return this.planilla.cerrar(fecha, { id: user.sub, rol: user.rol });
  }

  /** Solo el administrador puede reabrir un día cerrado */
  @Roles('ADMIN')
  @Post(':fecha/reabrir')
  @HttpCode(200)
  reabrir(@Param('fecha', ParseFechaPipe) fecha: string, @CurrentUser() user: JwtPayload) {
    return this.planilla.reabrir(fecha, { id: user.sub, rol: user.rol });
  }
}
