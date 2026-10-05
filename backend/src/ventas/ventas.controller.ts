import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { AnularImportacionDto, CierreManualDto, ImportarVentasDto } from './dto/ventas.dto';
import { VentasService } from './ventas.service';

@Roles('MESON')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  /** Cargas de ventas (archivos y cierres manuales) */
  @Get()
  listar() {
    return this.ventas.listar();
  }

  /** GET /api/ventas/reporte?desde=2026-10-01&hasta=2026-10-31 -> por mesonera y más vendidos */
  @Get('reporte')
  reporte(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) throw new BadRequestException('Indique desde y hasta (AAAA-MM-DD)');
    return this.ventas.reporte(desde, hasta);
  }

  /** Usuarios con código de mesonera */
  @Get('mesoneras')
  mesoneras() {
    return this.ventas.mesoneras();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.ventas.obtener(id);
  }

  /** POST /api/ventas/importar  (simular = true solo revisa) */
  @Post('importar')
  @HttpCode(200)
  importar(@Body() dto: ImportarVentasDto, @CurrentUser() user: JwtPayload) {
    return this.ventas.importarArchivo(dto, user.sub);
  }

  /** POST /api/ventas/cierre-manual  -> resumen del reporte impreso de la balanza */
  @Post('cierre-manual')
  cierreManual(@Body() dto: CierreManualDto, @CurrentUser() user: JwtPayload) {
    return this.ventas.cierreManual(dto, user.sub);
  }

  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularImportacionDto, @CurrentUser() user: JwtPayload) {
    return this.ventas.anular(id, dto.motivo, user.sub);
  }
}
