import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseBoolPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { AnularGuiaDto, EmitirGuiaDto, EmitirLoteDto, ImprimirGuiasDto } from './dto/guia.dto';
import { GuiasService } from './guias.service';

@Roles('DESPACHO')
@Controller('guias')
export class GuiasController {
  constructor(private readonly guias: GuiasService) {}

  /** GET /api/guias?fecha=2026-10-04&clienteId=5&numero=120&incluirAnuladas=true */
  @Get()
  listar(
    @Query('fecha') fecha?: string,
    @Query('clienteId', new ParseIntPipe({ optional: true })) clienteId?: number,
    @Query('numero', new ParseIntPipe({ optional: true })) numero?: number,
    @Query('incluirAnuladas', new ParseBoolPipe({ optional: true })) incluirAnuladas?: boolean,
  ) {
    if (fecha && !esFechaISO(fecha)) throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    return this.guias.listar({ fecha: fecha || undefined, clienteId, numero, incluirAnuladas });
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.guias.obtener(id);
  }

  @Post()
  emitir(@Body() dto: EmitirGuiaDto, @CurrentUser() user: JwtPayload) {
    return this.guias.emitir(dto.despachoId, user.sub);
  }

  @Post('lote')
  emitirLote(@Body() dto: EmitirLoteDto, @CurrentUser() user: JwtPayload) {
    return this.guias.emitirLote(dto.fecha, { modalidad: dto.modalidad, repartidorId: dto.repartidorId }, user.sub);
  }

  /** Devuelve las guías listas para imprimir y suma 1 a su contador de impresiones */
  @Post('imprimir')
  @HttpCode(200)
  imprimir(@Body() dto: ImprimirGuiasDto, @CurrentUser() user: JwtPayload) {
    return this.guias.imprimir(dto.ids, user.sub);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularGuiaDto, @CurrentUser() user: JwtPayload) {
    return this.guias.anular(id, dto.motivo, user.sub);
  }
}
