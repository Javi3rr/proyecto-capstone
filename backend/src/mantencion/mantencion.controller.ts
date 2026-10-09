import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Equals } from 'class-validator';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MantencionService } from './mantencion.service';

class ConfirmacionDto {
  @Equals('BORRAR', { message: 'Escriba BORRAR para confirmar' })
  confirmacion!: string;
}

@Roles('ADMIN')
@Controller('mantencion')
export class MantencionController {
  constructor(private readonly mantencion: MantencionService) {}

  /** POST /api/mantencion/limpiar-despacho  { "confirmacion": "BORRAR" } */
  @Post('limpiar-despacho')
  @HttpCode(200)
  limpiarDespacho(@Body() _dto: ConfirmacionDto, @CurrentUser() user: JwtPayload) {
    return this.mantencion.limpiarDespacho(user.sub);
  }
}
