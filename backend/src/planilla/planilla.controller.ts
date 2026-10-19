import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseFechaPipe } from '../common/parse-fecha.pipe';
import { RegistrarLineaDto, RepartidorUnicoDto } from './dto/linea.dto';
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

  /** PUT /api/planilla/2026-10-04/clientes/5/vueltas/1  { "kg": 12 }   (vuelta 1 = mañana, 2 y 3 = tarde) */
  @Put(':fecha/clientes/:clienteId/vueltas/:vuelta')
  registrar(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Param('vuelta', ParseIntPipe) vuelta: number,
    @Body() dto: RegistrarLineaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.planilla.registrarLinea(fecha, clienteId, vuelta, dto, { id: user.sub, rol: user.rol });
  }

  /** PUT /api/planilla/2026-10-04/repartidor-unico  { "repartidorId": 2 }  (null = cada repartidor el suyo) */
  @Put(':fecha/repartidor-unico')
  repartidorUnico(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Body() dto: RepartidorUnicoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.planilla.asignarRepartidorUnico(fecha, dto.repartidorId ?? null, { id: user.sub, rol: user.rol });
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
