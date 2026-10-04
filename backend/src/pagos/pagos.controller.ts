import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { ParseFechaPipe } from '../common/parse-fecha.pipe';
import { RegistrarPagoDto } from './dto/pago.dto';
import { PagosService } from './pagos.service';

@Roles('DESPACHO')
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagos: PagosService) {}

  /** GET /api/pagos/saldos -> saldo pendiente por cliente */
  @Get('saldos')
  saldos() {
    return this.pagos.saldos();
  }

  /** GET /api/pagos/clientes/5/estado-cuenta?desde=2026-09-01&hasta=2026-10-05 */
  @Get('clientes/:clienteId/estado-cuenta')
  estadoCuenta(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new BadRequestException('Indique desde y hasta (AAAA-MM-DD)');
    return this.pagos.estadoCuenta(clienteId, desde, hasta);
  }

  /** PUT /api/pagos/2026-10-05/clientes/5  { "monto": 24000, "repartidorId": 2 }  (monto 0 = no pagó) */
  @Put(':fecha/clientes/:clienteId')
  registrar(
    @Param('fecha', ParseFechaPipe) fecha: string,
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Body() dto: RegistrarPagoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pagos.registrar(fecha, clienteId, dto, user.sub);
  }
}
