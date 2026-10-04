import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseFechaPipe } from '../common/parse-fecha.pipe';
import { CuadreService } from './cuadre.service';

@Roles('DESPACHO')
@Controller('cuadre')
export class CuadreController {
  constructor(private readonly cuadre: CuadreService) {}

  /** GET /api/cuadre/2026-10-04 */
  @Get(':fecha')
  obtener(@Param('fecha', ParseFechaPipe) fecha: string) {
    return this.cuadre.obtener(fecha);
  }
}
