import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { JwtPayload } from '../common/auth.types';
import { AuthService } from './auth.service';
import { CambiarClaveDto } from './dto/cambiar-clave.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/login  { username, password } */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  /** GET /api/auth/me  -> datos del usuario de la sesión actual */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.perfil(user.sub);
  }

  /** POST /api/auth/cambiar-clave  { actual, nueva } -> nueva sesión */
  @Post('cambiar-clave')
  @HttpCode(200)
  cambiarClave(@Body() dto: CambiarClaveDto, @CurrentUser() user: JwtPayload) {
    return this.auth.cambiarClave(user.sub, dto.actual, dto.nueva);
  }
}
