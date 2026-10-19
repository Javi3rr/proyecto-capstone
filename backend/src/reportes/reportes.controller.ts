import { BadRequestException, Controller, Get, ParseEnumPipe, ParseIntPipe, Query } from '@nestjs/common';
import { ModalidadCliente } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { ReportesService } from './reportes.service';

const esMes = (v?: string): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

@Roles('DESPACHO')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** GET /api/reportes/historial?desde=2026-10-01&hasta=2026-10-05&clienteId=&repartidorId=&vuelta=&modalidad= */
  @Get('historial')
  historial(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('clienteId', new ParseIntPipe({ optional: true })) clienteId?: number,
    @Query('repartidorId', new ParseIntPipe({ optional: true })) repartidorId?: number,
    @Query('vuelta', new ParseIntPipe({ optional: true })) vuelta?: number,
    @Query('modalidad', new ParseEnumPipe(ModalidadCliente, { optional: true })) modalidad?: ModalidadCliente,
  ) {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new BadRequestException('Indique desde y hasta (AAAA-MM-DD)');
    return this.reportes.historial({ desde, hasta, clienteId, repartidorId, vuelta, modalidad });
  }

  /** GET /api/reportes/promedio-mensual?desde=2026-05&hasta=2026-10&repartidorId=&modalidad= */
  @Get('promedio-mensual')
  promedioMensual(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('repartidorId', new ParseIntPipe({ optional: true })) repartidorId?: number,
    @Query('modalidad', new ParseEnumPipe(ModalidadCliente, { optional: true })) modalidad?: ModalidadCliente,
  ) {
    if (!esMes(desde) || !esMes(hasta)) throw new BadRequestException('Indique los meses desde y hasta (AAAA-MM)');
    return this.reportes.promedioMensual({ desde, hasta, repartidorId, modalidad });
  }
}
