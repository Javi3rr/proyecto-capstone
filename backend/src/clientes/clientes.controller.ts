import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ClientesService } from './clientes.service';

/**
 * Base del módulo de clientes de Despacho.
 * Por ahora solo lectura; el CRUD completo corresponde a la historia
 * "[DESPACHO] Crear, modificar y eliminar clientes".
 */
@Roles('DESPACHO')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  listar() {
    return this.clientes.listar();
  }
}
