import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ModalidadCliente } from '@prisma/client';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ClientesService } from './clientes.service';
import { ActualizarClienteDto, CrearClienteDto } from './dto/cliente.dto';

@Roles('DESPACHO')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  /** GET /api/clientes?incluirInactivos=true&modalidad=REPARTO&buscar=lag */
  @Get()
  listar(
    @Query('incluirInactivos', new ParseBoolPipe({ optional: true })) incluirInactivos?: boolean,
    @Query('modalidad') modalidad?: string,
    @Query('buscar') buscar?: string,
  ) {
    if (modalidad && !(modalidad in ModalidadCliente)) {
      throw new BadRequestException('Modalidad inválida');
    }
    return this.clientes.listar({
      incluirInactivos,
      modalidad: modalidad ? (modalidad as ModalidadCliente) : undefined,
      buscar: buscar || undefined,
    });
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.clientes.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearClienteDto, @CurrentUser() user: JwtPayload) {
    return this.clientes.crear(dto, user.sub);
  }

  /** También permite reactivar: { "activo": true } */
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarClienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientes.actualizar(id, dto, user.sub);
  }

  /** Eliminación lógica (desactivar) */
  @Delete(':id')
  desactivar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.clientes.desactivar(id, user.sub);
  }
}
