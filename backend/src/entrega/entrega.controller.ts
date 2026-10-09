import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseFechaPipe } from '../common/parse-fecha.pipe';
import { NoPagoDto } from './dto/no-pago.dto';
import { EntregaService } from './entrega.service';

@Roles('DESPACHO')
@Controller('entrega')
export class EntregaController {
  constructor(private readonly entrega: EntregaService) {}

  /** GET /api/entrega/2026-10-09: lo que cada repartidor debe entregar ese día */
  @Get(':fecha')
  obtener(@Param('fecha', ParseFechaPipe) fecha: string) {
    return this.entrega.obtener(fecha);
  }

  /** PUT /api/entrega/2026-10-09/no-pago/5  { "nota": "No estaba" } */
  @Put(':fecha/no-pago/:clienteId')
  marcarNoPago(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Body() dto: NoPagoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.entrega.marcarNoPago(fecha, clienteId, dto.nota ?? null, user.sub);
  }

  /** DELETE /api/entrega/2026-10-09/no-pago/5: el cliente sí pagó */
  @Delete(':fecha/no-pago/:clienteId')
  quitarNoPago(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.entrega.quitarNoPago(fecha, clienteId, user.sub);
  }
}
