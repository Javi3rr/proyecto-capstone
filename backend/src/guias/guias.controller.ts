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

  /** GET /api/guias/impresion?ids=12,13  -> guías para la vista de impresión (no registra nada) */
  @Get('impresion')
  paraImprimir(@Query('ids') ids?: string) {
    const lista = (ids ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
    if (lista.length === 0 || lista.length > 200) throw new BadRequestException('Indique entre 1 y 200 guías');
    return this.guias.paraImprimir(lista);
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
    return this.guias.emitirLote(dto.fecha, { modalidad: dto.modalidad, repartidorId: dto.repartidorId, vuelta: dto.vuelta }, user.sub);
  }

  /** Confirma que las guías se imprimieron (solo entonces una reimpresión sale como "COPIA") */
  @Post('impresion/confirmar')
  @HttpCode(200)
  confirmarImpresion(@Body() dto: ImprimirGuiasDto, @CurrentUser() user: JwtPayload) {
    return this.guias.confirmarImpresion(dto.ids, user.sub);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularGuiaDto, @CurrentUser() user: JwtPayload) {
    return this.guias.anular(id, dto.motivo, user.sub);
  }
}
