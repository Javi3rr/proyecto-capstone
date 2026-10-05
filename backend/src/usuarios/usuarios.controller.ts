import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ActualizarUsuarioDto, CrearUsuarioDto, RestablecerClaveDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

@Roles('ADMIN')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.usuarios.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() user: JwtPayload) {
    return this.usuarios.crear(dto, user.sub);
  }

  /** Editar nombre, rol, código de mesonera, o activar/desactivar: { "activo": false } */
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto, @CurrentUser() user: JwtPayload) {
    return this.usuarios.actualizar(id, dto, user.sub);
  }

  /** POST /api/usuarios/5/clave  { "password": "..." } */
  @Post(':id/clave')
  @HttpCode(200)
  restablecerClave(@Param('id', ParseIntPipe) id: number, @Body() dto: RestablecerClaveDto, @CurrentUser() user: JwtPayload) {
    return this.usuarios.restablecerClave(id, dto.password, user.sub);
  }

  @Post(':id/cerrar-sesiones')
  @HttpCode(200)
  cerrarSesiones(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.usuarios.cerrarSesiones(id, user.sub);
  }
}
